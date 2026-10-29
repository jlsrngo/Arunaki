import { useState } from "react";
import {
  X,
  Clock,
  Calendar,
  Send,
  Paperclip,
  Check,
  ChevronDown,
  Trash2,
  ExternalLink,
  Link,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "../../../lib/utils";
import {
  TaskItem,
  Subtask,
  TIME_PRESETS,
  PRIORITY_CONFIGS,
  DEFAULT_COLUMNS,
  getTodayString,
  getTomorrowString,
  buildGoogleCalendarUrl,
  openExternalUrl,
} from "../taskTypes";

interface TaskModalProps {
  isOpen: boolean;
  editingTask: TaskItem | null;
  projectFiles: string[];
  onClose: () => void;
  onSave: (taskData: Omit<TaskItem, "id" | "createdAt" | "updatedAt">, autoOpenGCal: boolean) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  isIndonesian: boolean;
  t: (key: any, fallback?: string) => any;
}

export function TaskModal({
  isOpen,
  editingTask,
  projectFiles,
  onClose,
  onSave,
  onDelete,
  isIndonesian,
  t,
}: TaskModalProps) {
  const [modalTitle, setModalTitle] = useState(() => editingTask?.title || "");
  const [modalDescription, setModalDescription] = useState(() => editingTask?.description || "");
  const [modalColumn, setModalColumn] = useState<TaskItem["columnId"]>(() => editingTask?.columnId || "today");
  const [modalDate, setModalDate] = useState(() => editingTask?.targetDate || getTodayString());
  const [modalTime, setModalTime] = useState(() => editingTask?.reminderTime || "09:00");
  const [customTimeInput, setCustomTimeInput] = useState(() => editingTask?.reminderTime || "09:00");
  const [modalTelegram, setModalTelegram] = useState(() => editingTask ? Boolean(editingTask.telegramReminderEnabled) : true);
  const [modalPriority, setModalPriority] = useState<TaskItem["priority"]>(() => editingTask?.priority || "medium");
  const [modalFile, setModalFile] = useState(() => editingTask?.attachedFile || "");
  const [modalSubtasks, setModalSubtasks] = useState<Subtask[]>(() => editingTask?.subtasks || []);
  const [newSubtaskInput, setNewSubtaskInput] = useState("");
  const [modalAutoOpenGCal, setModalAutoOpenGCal] = useState(false);

  // Custom popovers
  const [isTimeDropdownOpen, setIsTimeDropdownOpen] = useState(false);
  const [isColumnDropdownOpen, setIsColumnDropdownOpen] = useState(false);
  const [isPriorityDropdownOpen, setIsPriorityDropdownOpen] = useState(false);

  if (!isOpen) return null;

  const handleAddSubtask = () => {
    if (!newSubtaskInput.trim()) return;
    const newSt: Subtask = {
      id: `st_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: newSubtaskInput.trim(),
      completed: false,
    };
    setModalSubtasks([...modalSubtasks, newSt]);
    setNewSubtaskInput("");
  };

  const handleRemoveSubtask = (stId: string) => {
    setModalSubtasks(modalSubtasks.filter((s) => s.id !== stId));
  };

  const handleSave = async () => {
    if (!modalTitle.trim()) {
      toast.error(isIndonesian ? "Judul agenda wajib diisi" : "Task title is required");
      return;
    }

    const reminderDateTime = `${modalDate}T${modalTime}:00`;
    const gcalUrl = buildGoogleCalendarUrl({
      title: modalTitle.trim(),
      targetDate: modalDate,
      reminderTime: modalTime,
      description: modalDescription.trim(),
      attachedFile: modalFile,
      priority: modalPriority,
      subtasks: modalSubtasks,
    });

    await onSave(
      {
        title: modalTitle.trim(),
        description: modalDescription.trim(),
        columnId: modalColumn,
        targetDate: modalDate,
        reminderTime: modalTime,
        reminderDateTime,
        telegramReminderEnabled: modalTelegram,
        notifiedAt: editingTask?.notifiedAt || null,
        priority: modalPriority,
        attachedFile: modalFile,
        subtasks: modalSubtasks,
        gcalUrl,
      },
      modalAutoOpenGCal
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-4xl bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-xl shadow-2xl flex flex-col max-h-[94vh] overflow-hidden"
        onClick={() => {
          setIsTimeDropdownOpen(false);
          setIsColumnDropdownOpen(false);
          setIsPriorityDropdownOpen(false);
        }}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)] bg-[var(--bg-card)]/50">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#cf6613]" />
            <h3 className="text-sm font-semibold text-white tracking-wide">
              {editingTask ? t("taskEditModalTitle", "Edit Agenda Operasional") : t("taskCreateModalTitle", "Catat Agenda Operasional")}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body: 4-Column Responsive Layout, Zero Need to Scroll */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3.5">
          {/* Row 1: Judul Tugas */}
          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-[var(--text-secondary)]">
              {t("taskTitleLabel", "Judul Agenda Operasional")} <span className="text-[#cf6613]">*</span>
            </label>
            <input
              type="text"
              placeholder={t("taskTitlePlaceholder", "Contoh: Rekonsiliasi faktur pajak supplier PT Maju...")}
              value={modalTitle}
              onChange={(e) => setModalTitle(e.target.value)}
              className="w-full px-3 py-1.5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg text-white text-xs placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
            />
          </div>

          {/* Row 2: 4 Kolom Rata Kiri-Kanan (Kolom Papan, Tanggal, Jam, Prioritas) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {/* 1. Kolom Papan */}
            <div className="space-y-1 relative">
              <label className="block text-[11px] font-medium text-[var(--text-secondary)]">
                {t("taskColumnLabel", "Kolom Papan")}
              </label>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsColumnDropdownOpen(!isColumnDropdownOpen);
                  setIsTimeDropdownOpen(false);
                  setIsPriorityDropdownOpen(false);
                }}
                className="w-full px-2.5 py-1.5 bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-[var(--border-strong)] rounded-lg text-white text-xs flex items-center justify-between transition-colors cursor-pointer"
              >
                <span className="truncate">{DEFAULT_COLUMNS.find((c) => c.id === modalColumn)?.defaultTitle || modalColumn}</span>
                <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
              </button>

              {isColumnDropdownOpen && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute left-0 top-full mt-1.5 w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 space-y-0.5"
                >
                  <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-color)]/60 mb-1 flex items-center justify-between">
                    <span>{t("selectColumn", "Pilih Kolom")}</span>
                    <span className="text-[#cf6613] font-semibold">KANBAN</span>
                  </div>
                  {DEFAULT_COLUMNS.map((col) => {
                    const isSelected = modalColumn === col.id;
                    return (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() => {
                          setModalColumn(col.id);
                          if (col.id === "today") setModalDate(getTodayString());
                          if (col.id === "tomorrow") setModalDate(getTomorrowString());
                          setIsColumnDropdownOpen(false);
                        }}
                        className={cn(
                          "w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors",
                          isSelected
                            ? "bg-[var(--bg-hover)] text-white font-semibold"
                            : "text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-hover)]"
                        )}
                      >
                        <span>{t(col.titleId, col.defaultTitle)}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-white shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 2. Tanggal Target */}
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-[var(--text-secondary)]">
                {t("taskTargetDateLabel", "Tanggal Target")}
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-white/60 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="date"
                  value={modalDate}
                  onChange={(e) => setModalDate(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg text-white font-mono text-xs focus:outline-none focus:border-[var(--border-strong)]"
                />
              </div>
            </div>

            {/* 3. Jam Pelaksanaan WIB */}
            <div className="space-y-1 relative">
              <label className="block text-[11px] font-medium text-[var(--text-secondary)] flex items-center gap-1">
                <Clock className="w-3 h-3 text-[#cf6613]" />
                {t("taskScheduledTimeLabel", "Jam (WIB)")}
              </label>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsTimeDropdownOpen(!isTimeDropdownOpen);
                  setIsColumnDropdownOpen(false);
                  setIsPriorityDropdownOpen(false);
                }}
                className="w-full px-2.5 py-1.5 bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-[var(--border-strong)] rounded-lg text-white font-mono text-xs flex items-center justify-between transition-colors cursor-pointer"
              >
                <span>{modalTime} WIB</span>
                <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
              </button>

              {isTimeDropdownOpen && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute left-0 top-full mt-1.5 w-64 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150 space-y-1.5"
                >
                  <div className="px-1 text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-color)]/60 pb-1 flex items-center justify-between">
                    <span>{t("selectTimeSlot", "Pilih Jadwal Jam")}</span>
                    <span className="text-[#cf6613] font-semibold">WIB</span>
                  </div>

                  <div className="space-y-0.5 max-h-44 overflow-y-auto pr-1">
                    {TIME_PRESETS.map((slot) => {
                      const isSelected = modalTime === slot.time;
                      return (
                        <button
                          key={slot.time}
                          type="button"
                          onClick={() => {
                            setModalTime(slot.time);
                            setCustomTimeInput(slot.time);
                            setIsTimeDropdownOpen(false);
                          }}
                          className={cn(
                            "w-full text-left px-2 py-1.5 rounded-lg text-xs flex items-center justify-between cursor-pointer transition-colors",
                            isSelected
                              ? "bg-[var(--bg-hover)] text-white font-semibold"
                              : "text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-hover)]"
                          )}
                        >
                          <span className="font-mono">{slot.label}</span>
                          <div className="flex items-center gap-1">
                            <span className="text-[9px] px-1 py-0.2 rounded bg-[var(--bg-panel)] border border-[var(--border-color)] text-[var(--text-muted)]">
                              {slot.badge}
                            </span>
                            {isSelected && <Check className="w-3 h-3 text-white shrink-0" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="pt-1.5 border-t border-[var(--border-color)]/60 flex items-center gap-1.5">
                    <input
                      type="text"
                      placeholder="HH:mm"
                      value={customTimeInput}
                      onChange={(e) => setCustomTimeInput(e.target.value)}
                      className="flex-1 px-2 py-1 bg-[var(--bg-panel)] border border-[var(--border-color)] rounded text-xs font-mono text-white placeholder:text-[var(--text-muted)] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const clean = customTimeInput.trim();
                        if (/^([01]\d|2[0-3]):[0-5]\d$/.test(clean)) {
                          setModalTime(clean);
                          setIsTimeDropdownOpen(false);
                        } else {
                          toast.error(isIndonesian ? "Format jam harus HH:mm (contoh 09:30)" : "Time format must be HH:mm");
                        }
                      }}
                      className="px-2 py-1 rounded bg-[#cf6613] hover:bg-[#b8550f] text-white text-xs font-medium cursor-pointer transition-colors"
                    >
                      {t("applyTime", "Terapkan")}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 4. Prioritas */}
            <div className="space-y-1 relative">
              <label className="block text-[11px] font-medium text-[var(--text-secondary)]">
                {t("taskPriorityLabel", "Tingkat Prioritas")}
              </label>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPriorityDropdownOpen(!isPriorityDropdownOpen);
                  setIsTimeDropdownOpen(false);
                  setIsColumnDropdownOpen(false);
                }}
                className="w-full px-2.5 py-1.5 bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-[var(--border-strong)] rounded-lg text-white text-xs flex items-center justify-between transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span className={cn("w-2 h-2 rounded-full shrink-0", PRIORITY_CONFIGS.find((p) => p.id === modalPriority)?.dot)} />
                  <span className="truncate">{PRIORITY_CONFIGS.find((p) => p.id === modalPriority)?.title || modalPriority}</span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
              </button>

              {isPriorityDropdownOpen && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute left-0 top-full mt-1.5 w-full bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 space-y-0.5"
                >
                  <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] border-b border-[var(--border-color)]/60 mb-1 flex items-center justify-between">
                    <span>{t("selectPriority", "Pilih Prioritas")}</span>
                    <span className="text-[#cf6613] font-semibold">URGENCY</span>
                  </div>
                  {PRIORITY_CONFIGS.map((p) => {
                    const isSelected = modalPriority === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setModalPriority(p.id);
                          setIsPriorityDropdownOpen(false);
                        }}
                        className={cn(
                          "w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between gap-2 cursor-pointer transition-colors",
                          isSelected
                            ? "bg-[var(--bg-hover)] text-white font-semibold"
                            : "text-[var(--text-secondary)] hover:text-white hover:bg-[var(--bg-hover)]"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className={cn("w-2 h-2 rounded-full", p.dot)} />
                          <span className="text-white">{p.title}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-[var(--bg-panel)] border border-[var(--border-color)] text-[var(--text-muted)] font-medium">
                            {p.badge}
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-white shrink-0" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Row 3: 2 Kolom Integrasi (Telegram & Google Calendar Bersebelahan) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Telegram Reminder */}
            <div className="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-md bg-[var(--bg-hover)] border border-[var(--border-color)] flex items-center justify-center shrink-0">
                  <Send className="w-3.5 h-3.5 text-[#cf6613]" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-xs font-semibold text-white truncate">{t("taskTelegramReminder", "Pengingat Telegram Eksekutif")}</h4>
                  <p className="text-[10px] text-[var(--text-muted)] truncate">
                    {t("taskTelegramReminderDesc", "Kirim pemberitahuan ke Telegram saat jadwal tiba")}
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={modalTelegram}
                onChange={(e) => setModalTelegram(e.target.checked)}
                className="w-4 h-4 accent-[#cf6613] cursor-pointer shrink-0"
              />
            </div>

            {/* Google Calendar Link & Auto-Sync Card */}
            <div className="p-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-md bg-[var(--bg-hover)] border border-[var(--border-color)] flex items-center justify-center shrink-0">
                    <Calendar className="w-3.5 h-3.5 text-[#cf6613]" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-xs font-semibold text-white">Google Calendar</h4>
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-[#cf6613]/15 text-[#cf6613] border border-[#cf6613]/30">
                        Auto-Link
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const gcalUrl = buildGoogleCalendarUrl({
                        title: modalTitle || "Agenda Operasional",
                        targetDate: modalDate,
                        reminderTime: modalTime,
                        description: modalDescription,
                        attachedFile: modalFile,
                        priority: modalPriority,
                        subtasks: modalSubtasks,
                      });
                      navigator.clipboard.writeText(gcalUrl);
                      toast.success(isIndonesian ? "Tautan Google Calendar berhasil disalin!" : "Google Calendar link copied!");
                    }}
                    title={isIndonesian ? "Salin tautan Google Calendar" : "Copy Google Calendar link"}
                    className="px-2 py-0.5 rounded bg-[var(--bg-hover)] hover:bg-[var(--bg-panel)] text-[var(--text-secondary)] hover:text-white text-[11px] border border-[var(--border-color)] flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Link className="w-2.5 h-2.5" />
                    <span>Salin</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const gcalUrl = buildGoogleCalendarUrl({
                        title: modalTitle || "Agenda Operasional",
                        targetDate: modalDate,
                        reminderTime: modalTime,
                        description: modalDescription,
                        attachedFile: modalFile,
                        priority: modalPriority,
                        subtasks: modalSubtasks,
                      });
                      openExternalUrl(gcalUrl);
                      toast.success(isIndonesian ? "Membuka Google Calendar..." : "Opening Google Calendar...");
                    }}
                    className="px-2 py-0.5 rounded bg-[#cf6613] hover:bg-[#b8550f] text-white text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer shadow-sm"
                  >
                    <ExternalLink className="w-2.5 h-2.5" />
                    <span>Buka Kalender</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-[var(--border-color)]/60 text-[10px]">
                <label className="flex items-center gap-1.5 cursor-pointer text-[var(--text-secondary)] hover:text-white truncate">
                  <input
                    type="checkbox"
                    checked={modalAutoOpenGCal}
                    onChange={(e) => setModalAutoOpenGCal(e.target.checked)}
                    className="w-3 h-3 accent-[#cf6613] cursor-pointer shrink-0"
                  />
                  <span className="truncate">{isIndonesian ? "Buka kalender otomatis saat disimpan" : "Auto-open when saved"}</span>
                </label>
                <span className="text-[9.5px] text-[var(--text-muted)] font-mono shrink-0 pl-1">
                  {modalDate} • {modalTime} WIB
                </span>
              </div>
            </div>
          </div>

          {/* Row 4: 2 Kolom Lebar (Kiri: Berkas & Catatan, Kanan: Checklist Subtugas) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 border-t border-[var(--border-color)]/70">
            {/* Sisi Kiri: Dokumen Terkait & Catatan Kerja */}
            <div className="space-y-2.5">
              {/* Berkas Proyek */}
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Paperclip className="w-3 h-3 text-white/70" />
                    {t("taskAttachedDocument", "Dokumen Terkait (Opsional)")}
                  </span>
                  {projectFiles.length > 0 && (
                    <span className="text-[9.5px] text-[var(--text-muted)] font-mono">
                      {projectFiles.length} berkas
                    </span>
                  )}
                </label>
                <input
                  type="text"
                  placeholder={t("taskAttachedDocumentPlaceholder", "Contoh: faktur_pajak.xlsx...")}
                  value={modalFile}
                  onChange={(e) => setModalFile(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg text-white font-mono text-xs placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)]"
                />
                {projectFiles.length > 0 && (
                  <div className="flex items-center gap-1 overflow-x-auto pt-0.5 pb-0.5">
                    {projectFiles.slice(0, 5).map((file) => (
                      <button
                        key={file}
                        type="button"
                        onClick={() => setModalFile(file)}
                        className={cn(
                          "px-1.5 py-0.2 rounded text-[9.5px] font-mono border transition-colors cursor-pointer shrink-0 truncate max-w-[130px]",
                          modalFile === file
                            ? "bg-white text-black border-white font-semibold"
                            : "bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-white border-[var(--border-color)]"
                        )}
                      >
                        {file}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Catatan / Instruksi Kerja */}
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-[var(--text-secondary)]">
                  {t("taskDescriptionLabel", "Instruksi Kerja / Catatan")}
                </label>
                <textarea
                  rows={3}
                  placeholder={t("taskDescriptionPlaceholder", "Tuliskan catatan kerja, target rekonsiliasi, nominal biaya...")}
                  value={modalDescription}
                  onChange={(e) => setModalDescription(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg text-white text-xs placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)] resize-none"
                />
              </div>
            </div>

            {/* Sisi Kanan: Checklist Subtugas */}
            <div className="space-y-1.5 flex flex-col">
              <label className="block text-[11px] font-medium text-[var(--text-secondary)] flex items-center justify-between">
                <span>{t("taskSubtasks", "Daftar Rincian Subtugas / Checklist")}</span>
                <span className="text-[10px] text-[var(--text-muted)] font-mono">
                  {modalSubtasks.filter((s) => s.completed).length}/{modalSubtasks.length}
                </span>
              </label>

              {/* Subtask Input */}
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder={t("addSubtaskPlaceholder", "Tambah subtugas (Tekan Enter)...")}
                  value={newSubtaskInput}
                  onChange={(e) => setNewSubtaskInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddSubtask();
                    }
                  }}
                  className="flex-1 px-2.5 py-1.5 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg text-white text-xs placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--border-strong)]"
                />
                <button
                  type="button"
                  onClick={handleAddSubtask}
                  className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-hover)] text-white hover:bg-[var(--border-color)] border border-[var(--border-color)] text-xs font-medium transition-colors cursor-pointer shrink-0"
                >
                  {t("addSubtaskBtn", "Tambah")}
                </button>
              </div>

              {/* Subtask List Container */}
              <div className="flex-1 min-h-[96px] max-h-36 overflow-y-auto space-y-1 pr-0.5">
                {modalSubtasks.length === 0 ? (
                  <div className="h-full flex items-center justify-center p-3 text-center border border-dashed border-[var(--border-color)]/60 rounded-lg text-[var(--text-muted)] text-[11px]">
                    Belum ada checklist subtugas
                  </div>
                ) : (
                  modalSubtasks.map((st) => (
                    <div
                      key={st.id}
                      className="flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)] text-xs"
                    >
                      <label className="flex items-center gap-2 flex-1 cursor-pointer truncate">
                        <input
                          type="checkbox"
                          checked={st.completed}
                          onChange={() => {
                            setModalSubtasks(
                              modalSubtasks.map((s) =>
                                s.id === st.id ? { ...s, completed: !s.completed } : s
                              )
                            );
                          }}
                          className="w-3.5 h-3.5 accent-[#cf6613] cursor-pointer shrink-0"
                        />
                        <span className={cn("truncate text-xs", st.completed ? "line-through text-[var(--text-muted)]" : "text-white")}>
                          {st.title}
                        </span>
                      </label>
                      <button
                        type="button"
                        onClick={() => handleRemoveSubtask(st.id)}
                        className="p-1 text-[var(--text-muted)] hover:text-rose-400 transition-colors cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-5 py-2.5 border-t border-[var(--border-color)] bg-[var(--bg-card)]/50">
          <div className="flex items-center gap-2">
            {editingTask && onDelete ? (
              <button
                type="button"
                onClick={() => onDelete(editingTask.id)}
                className="px-3 py-1.5 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t("taskDeleteBtn", "Hapus Agenda")}</span>
              </button>
            ) : null}

            {/* Google Calendar Quick Sync Button */}
            <button
              type="button"
              onClick={() => {
                const gcalUrl = buildGoogleCalendarUrl({
                  title: modalTitle || "Agenda Operasional",
                  targetDate: modalDate,
                  reminderTime: modalTime,
                  description: modalDescription,
                  attachedFile: modalFile,
                  priority: modalPriority,
                  subtasks: modalSubtasks,
                });
                openExternalUrl(gcalUrl);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)] text-white text-xs font-medium border border-[var(--border-color)] flex items-center gap-1.5 transition-colors cursor-pointer"
              title={t("syncGoogleCalendar", "Sinkron ke Google Calendar")}
            >
              <Calendar className="w-3.5 h-3.5 text-[#cf6613]" />
              <span className="hidden sm:inline">{t("syncGoogleCalendar", "Sinkron Google Calendar")}</span>
            </button>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-white text-xs font-medium border border-[var(--border-color)] transition-colors cursor-pointer"
            >
              {t("taskCancelBtn", "Batal")}
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg bg-[#cf6613] hover:bg-[#b8550f] text-white text-xs font-medium transition-colors cursor-pointer shadow-sm"
            >
              {editingTask ? t("taskSaveBtn", "Simpan Perubahan") : t("taskCreateBtn", "Catat Agenda")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
