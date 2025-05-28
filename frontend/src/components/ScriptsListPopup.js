import { useEffect, useState } from "react";

const ScriptsListPopup = ({ ws, open, onClose }) => {
  const [visibleFiles, setVisibleFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteStatus, setDeleteStatus] = useState({}); // { [file]: "pending"|"error"|"ok" }
  const [deleteError, setDeleteError] = useState(null);

  // Fetch scripts list
  useEffect(() => {
    if (!open || !ws || ws.readyState !== WebSocket.OPEN) return;

    setLoading(true);
    setError(null);

    ws.send(JSON.stringify({ command: "list_scripts", args: [] }));

    const handleListScripts = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === "ok" && Array.isArray(data.visible)) {
          setVisibleFiles(data.visible);
          setLoading(false);
        } else if (data.status === "error") {
          setError(data.message || "Ошибка при получении списка скриптов");
          setLoading(false);
        }
      } catch (e) {
        setError("Ошибка при разборе ответа сервера");
        setLoading(false);
      }
      ws.removeEventListener("message", handleListScripts);
    };

    ws.addEventListener("message", handleListScripts);

    return () => {
      ws.removeEventListener("message", handleListScripts);
    };
  }, [open, ws]);

  // Delete script handler
  const handleDelete = (file) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    setDeleteStatus((prev) => ({ ...prev, [file]: "pending" }));
    setDeleteError(null);

    ws.send(JSON.stringify({ command: "delete_script", args: [file] }));

    const handleDeleteScript = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (
          (data.status === "ok" || data.status === "error") &&
          typeof data.message === "string"
        ) {
          if (data.status === "ok") {
            setDeleteStatus((prev) => ({ ...prev, [file]: "ok" }));
            // Remove file from visibleFiles
            setVisibleFiles((prev) => prev.filter((f) => f !== file));
          } else {
            setDeleteStatus((prev) => ({ ...prev, [file]: "error" }));
            setDeleteError(data.message || "Ошибка при удалении скрипта");
          }
        }
      } catch (e) {
        setDeleteStatus((prev) => ({ ...prev, [file]: "error" }));
        setDeleteError("Ошибка при разборе ответа сервера");
      }
      ws.removeEventListener("message", handleDeleteScript);
    };

    ws.addEventListener("message", handleDeleteScript);
  };

  if (!open) return null;

  return (
    <div
      className="modal fade show"
      style={{
        display: "block",
        background: "rgba(0,0,0,0.3)",
        position: "fixed",
        zIndex: 1050,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
      tabIndex="-1"
      onClick={onClose}
    >
      <div
        className="modal-dialog"
        style={{ pointerEvents: "auto", marginTop: "10vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Список скриптов</h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            {loading ? (
              <div className="text-center p-3">
                <div className="spinner-border text-secondary" role="status"></div>
              </div>
            ) : error ? (
              <div className="alert alert-danger">{error}</div>
            ) : (
              <>
                <h6>Пользовательские скрипты</h6>
                {visibleFiles.length === 0 ? (
                  <div className="text-muted mb-2">Нет пользовательских скриптов</div>
                ) : (
                  <ul className="list-group mb-3">
                    {visibleFiles.map((file) => (
                      <li key={file} className="list-group-item d-flex justify-content-between align-items-center">
                        <span>{file}</span>
                        <button
                          className="btn btn-sm btn-danger"
                          disabled={deleteStatus[file] === "pending"}
                          onClick={() => handleDelete(file)}
                        >
                          {deleteStatus[file] === "pending" ? (
                            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                          ) : (
                            "Удалить"
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {deleteError && (
                  <div className="alert alert-danger">{deleteError}</div>
                )}
              </>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>
              Закрыть
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScriptsListPopup;
