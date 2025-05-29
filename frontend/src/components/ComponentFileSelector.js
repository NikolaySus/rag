import { useEffect, useState } from "react";
import ItemSelector from "./ItemSelector";

/**
 * ComponentFileSelector
 * Popup dialog for selecting or creating a file to add a new component.
 *
 * Props:
 * - open: boolean - Whether the popup is visible.
 * - files: object - { [filePath]: id } map of available files.
 * - onSelect: function(filePath) - Called when a file is selected.
 * - onCreate: function(newFilePath) - Called when a new file is created.
 * - onClose: function() - Called to close the popup.
 * - title: string - Optional title for the popup.
 * - error: string|null - Error message to display (for file creation).
 * - creating: boolean - If true, disables create button and shows spinner.
 */
const ComponentFileSelector = ({
  open,
  files,
  onSelect,
  onCreate,
  onClose,
  title = "Выбор или создание модуля",
  error = null,
  creating = false,
}) => {
  const [selectedFile, setSelectedFile] = useState("");
  const [creatingNew, setCreatingNew] = useState(false);
  const [newFilePath, setNewFilePath] = useState("");

  // Reset state when popup opens/closes
  useEffect(() => {
    if (open) {
      setSelectedFile("");
      setCreatingNew(false);
      setNewFilePath("");
    }
  }, [open]);

  if (!open) return null;

  const handleFileChange = (e) => {
    setSelectedFile(e.target.value);
  };

  const handleSelect = () => {
    if (selectedFile) {
      onSelect(selectedFile);
      onClose();
    }
  };

  const handleCreateNew = () => {
    setCreatingNew(true);
    setNewFilePath("");
  };

  const handleCreateConfirm = () => {
    if (newFilePath.trim()) {
      onCreate(newFilePath.trim());
      // Do not close here; parent will close on success or show error on failure
    }
  };

  const handleCreateCancel = () => {
    setCreatingNew(false);
    setNewFilePath("");
  };

  return (
    <div
      className="modal show"
      style={{
        display: "block",
        background: "rgba(0,0,0,0.2)",
        zIndex: 2000,
      }}
      tabIndex={-1}
    >
      <div
        className="modal-dialog"
        style={{ maxWidth: 400, margin: "80px auto" }}
      >
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{title}</h5>
            <button
              type="button"
              className="btn-close"
              aria-label="Close"
              onClick={onClose}
              disabled={creating}
            />
          </div>
          <div className="modal-body">
            {!creatingNew ? (
              <>
                <ItemSelector
                  label="File"
                  name="file"
                  value={selectedFile}
                  options={files}
                  onChange={handleFileChange}
                  onCreate={handleCreateNew}
                  disabled={creating}
                  linkEnabled={false}
                />
              </>
            ) : (
              <div>
                <label className="form-label">Новый файл модуля</label>
                <input
                  className="form-control"
                  value={newFilePath}
                  onChange={(e) => setNewFilePath(e.target.value)}
                  placeholder="Например components.custom"
                  autoFocus
                  disabled={creating}
                />
                {error && (
                  <div className="alert alert-danger mt-2 mb-0 py-1 px-2" style={{ fontSize: "0.95em" }}>
                    {error}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="modal-footer">
            {!creatingNew ? (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onClose}
                  disabled={creating}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSelect}
                  disabled={!selectedFile || creating}
                >
                  Продолжить
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={handleCreateCancel}
                  disabled={creating}
                >
                  Назад
                </button>
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={handleCreateConfirm}
                  disabled={!newFilePath.trim() || creating}
                >
                  {creating ? (
                    <span>
                      <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                      Создание...
                    </span>
                  ) : (
                    "Создать"
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ComponentFileSelector;
