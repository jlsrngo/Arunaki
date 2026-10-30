import { Plus, Loader2, Cpu, Info, Terminal, Trash2 } from "lucide-react";
import { useI18n } from "../../lib/i18n";
import { ProviderCard } from "./ProviderCard";
import { ProviderForm } from "./ProviderForm";
import { Provider } from "./types";
import { PROVIDER_TYPES } from "./constants";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui";
import { useModelProviders, isCliProvider } from "./hooks/useModelProviders";

export type { Provider };
export { isCliProvider };

interface ModelProviderSettingsProps {
  providers: Provider[];
  availableCatalogModels?: Record<string, string[]>;
  loading: boolean;
  onRefresh: () => void;
  onUpdateProviders?: (updater: (prev: Provider[]) => Provider[]) => void;
}

export function ModelProviderSettings({
  providers,
  availableCatalogModels,
  loading,
  onRefresh,
  onUpdateProviders,
}: ModelProviderSettingsProps) {
  const { t } = useI18n();

  const {
    cloudProviders,
    showAddForm,
    setShowAddForm,
    editingId,
    testingId,
    isTestingForm,
    formTestResult,
    isFetchingFormModels,
    isAddingFormModel,
    setIsAddingFormModel,
    formNewModelInput,
    setFormNewModelInput,
    testResults,
    form,
    setForm,
    formAvailableModels,
    providerToDelete,
    setProviderToDelete,
    resetForm,
    handleToggleModelSelection,
    handleReorderModels,
    handleTypeChange,
    handleEdit,
    handleSave,
    handleDelete,
    executeDelete,
    handleToggleActive,
    handleMoveProviderPriority,
    handleFetchModelsInForm,
    handleAddCustomModelSubmit,
    handleTestConnection,
    handleTestFormConnection,
  } = useModelProviders({
    providers,
    availableCatalogModels,
    loading,
    onRefresh,
    onUpdateProviders,
  });

  return (
    <div className="space-y-6 w-full">
      {/* Top Description & Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-[var(--text-primary)] text-base flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[var(--text-primary)]" />
            {t("modelRoutingCatalogTitle")}
          </h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {t("modelRoutingCatalogSubtitle")}
          </p>
        </div>

        {!showAddForm && (
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              resetForm();
              setShowAddForm(true);
            }}
            className="flex items-center gap-1.5 font-medium shrink-0"
          >
            <Plus className="w-4 h-4" />
            {t("addProvider")}
          </Button>
        )}
      </div>

      {/* Add / Edit Form Modal or Card */}
      {showAddForm && (
        <ProviderForm
          form={form}
          setForm={setForm}
          formAvailableModels={formAvailableModels}
          providerTypes={PROVIDER_TYPES}
          isEditing={Boolean(editingId)}
          isTestingForm={isTestingForm}
          testResult={formTestResult}
          isFetchingFormModels={isFetchingFormModels}
          isAddingFormModel={isAddingFormModel}
          setIsAddingFormModel={setIsAddingFormModel}
          formNewModelInput={formNewModelInput}
          setFormNewModelInput={setFormNewModelInput}
          onTypeChange={handleTypeChange}
          onToggleModelSelection={handleToggleModelSelection}
          onReorderModels={handleReorderModels}
          onFetchModels={handleFetchModelsInForm}
          onAddCustomModelSubmit={handleAddCustomModelSubmit}
          onTestConnection={handleTestFormConnection}
          onSubmit={handleSave}
          onCancel={resetForm}
        />
      )}

      {/* Provider List */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-[var(--text-muted)] gap-3 bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)]">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--text-primary)]" />
            <p className="text-sm font-medium">{t("loadingProviders")}</p>
          </div>
        ) : cloudProviders.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-[var(--text-muted)] gap-3 bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] text-center">
            <Terminal className="w-8 h-8 opacity-40 text-[var(--text-muted)]" />
            <div>
              <p className="text-sm font-medium text-[var(--text-secondary)]">
                {t("noProvidersConfigured")}
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                {t("automaticFallbackDesc")}
              </p>
            </div>
            {!showAddForm && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  resetForm();
                  setShowAddForm(true);
                }}
                className="mt-2 text-xs"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                {t("addFirstProvider")}
              </Button>
            )}
          </div>
        ) : (
          cloudProviders.map((provider, index) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              index={index}
              totalProviders={cloudProviders.length}
              isTesting={testingId === provider.id}
              testResult={testResults[provider.id]}
              onToggleActive={handleToggleActive}
              onTestConnection={handleTestConnection}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onMovePriority={handleMoveProviderPriority}
            />
          ))
        )}
      </div>

      {/* Cloud Routing Intelligence Notice */}
      <div className="p-3.5 bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] flex items-start gap-3 text-xs text-[var(--text-muted)]">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-[var(--text-secondary)]" />
        <div className="space-y-1">
          <p className="font-medium text-[var(--text-primary)]">
            {t("automaticFallbackTitle")}
          </p>
          <p className="leading-relaxed">
            {t("automaticFallbackDesc")}
          </p>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(providerToDelete)}
        onOpenChange={(open) => !open && setProviderToDelete(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-500">
              <Trash2 className="w-5 h-5" />
              {t("deleteItemTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("deleteItemWarning")}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setProviderToDelete(null)}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (providerToDelete) {
                  executeDelete(providerToDelete);
                  setProviderToDelete(null);
                }
              }}
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              {t("deleteItemAction")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
