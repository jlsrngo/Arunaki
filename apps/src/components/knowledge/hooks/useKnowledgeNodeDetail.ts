import { useState, useEffect, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import { apiFetch, API_BASE } from '../../../lib/api';
import { subscribeKnowledgeSync } from '../../../lib/knowledgeSync';
import { filterLocalLocations, searchRemoteLocations } from '../locations';

interface UseKnowledgeNodeDetailOptions {
  nodeId: string | null;
  onClose: () => void;
  onUpdate: (id: string, data: any) => void;
  onDelete: (id: string) => void;
}

export function useKnowledgeNodeDetail({
  nodeId,
  onClose,
  onUpdate,
  onDelete,
}: UseKnowledgeNodeDetailOptions) {
  const [nodeData, setNodeData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [urls, setUrls] = useState<string[]>([]);
  const [city, setCity] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isCityDropdownOpen, setIsCityDropdownOpen] = useState(false);
  const cityDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (cityDropdownRef.current && !cityDropdownRef.current.contains(event.target as Node)) {
        setIsCityDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!nodeId || nodeId === 'main-ai-node') {
      setNodeData(null);
      return;
    }

    const fetchNode = async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`${API_BASE}/knowledge/${nodeId}`);
        if (res.ok) {
          const { data } = await res.json();
          setNodeData(data);
          setTitle(data.title);

          let cleanContent = data.content || '';
          if (
            cleanContent.startsWith('```csv') ||
            cleanContent.includes('JavaScript tidak diaktifkan') ||
            cleanContent === 'Enter knowledge content here...'
          ) {
            cleanContent = '';
          }
          setContent(cleanContent);

          setCity(data.city || '');
          try {
            const parsed = JSON.parse(data.urls || '[]');
            setUrls(Array.isArray(parsed) ? parsed : []);
          } catch {
            setUrls([]);
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchNode();
  }, [nodeId]);

  useEffect(() => {
    if (!nodeId || nodeId === 'main-ai-node') return;
    const unsubscribe = subscribeKnowledgeSync(() => {
      apiFetch(`${API_BASE}/knowledge/${nodeId}`)
        .then((res) => res.json())
        .then((json) => {
          if (json?.data) {
            setNodeData(json.data);
          }
        })
        .catch(() => {});
    });
    return unsubscribe;
  }, [nodeId]);

  const [remoteCities, setRemoteCities] = useState<string[]>([]);

  useEffect(() => {
    const clean = city.trim();
    if (clean.length < 2) {
      setRemoteCities([]);
      return;
    }

    const localMatches = filterLocalLocations(clean, 7);
    if (localMatches.length >= 7) {
      setRemoteCities([]);
      return;
    }

    const abortCtrl = new AbortController();
    const timer = setTimeout(() => {
      searchRemoteLocations(clean, 7, abortCtrl.signal)
        .then((results) => {
          if (!abortCtrl.signal.aborted) {
            setRemoteCities(results);
          }
        })
        .catch(() => {});
    }, 250);

    return () => {
      clearTimeout(timer);
      abortCtrl.abort();
    };
  }, [city]);

  const filteredCities = useMemo(() => {
    if (!city || city.trim().length < 2) return [];
    const localMatches = filterLocalLocations(city, 7);
    if (remoteCities.length > 0) return remoteCities;
    return localMatches;
  }, [city, remoteCities]);

  const handleSave = async () => {
    if (!nodeData || !nodeId) return;
    setSaving(true);
    try {
      let finalContent = content;
      if (
        finalContent.startsWith('```csv') ||
        finalContent.trim() === "Enter knowledge content here..." ||
        finalContent.includes("JavaScript tidak diaktifkan")
      ) {
        finalContent = "";
      }

      const res = await apiFetch(`${API_BASE}/knowledge/${nodeId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title,
          content: finalContent,
          urls: urls.map((u) => u.trim()).filter(Boolean),
          city,
        }),
      });
      if (res.ok) {
        const { data } = await res.json();
        onUpdate(nodeId, data);
        toast.success("Knowledge node saved successfully!");
        onClose();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error?.message || "Failed to save node");
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to save node");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!nodeId) return;
    try {
      const res = await apiFetch(`${API_BASE}/knowledge/${nodeId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        onDelete(nodeId);
        onClose();
        toast.success("Knowledge node deleted");
      } else {
        toast.error("Failed to delete node");
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to delete node");
    }
  };

  const toggleActive = async () => {
    if (!nodeId) return;
    try {
      const res = await apiFetch(`${API_BASE}/knowledge/${nodeId}/toggle`, {
        method: 'PATCH',
      });
      if (res.ok) {
        const { data } = await res.json();
        setNodeData(data);
        onUpdate(nodeId, data);
        toast.success(data.active ? "Node activated for AI" : "Node deactivated");
      }
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to toggle status");
    }
  };

  const isRulesNode = (nodeData?.type || '').toLowerCase() === 'rules';

  return {
    nodeData,
    loading,
    title,
    setTitle,
    urls,
    setUrls,
    city,
    setCity,
    content,
    setContent,
    saving,
    showDeleteConfirm,
    setShowDeleteConfirm,
    isCityDropdownOpen,
    setIsCityDropdownOpen,
    cityDropdownRef,
    filteredCities,
    handleSave,
    handleDelete,
    toggleActive,
    isRulesNode,
  };
}
