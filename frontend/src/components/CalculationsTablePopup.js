import AnsiToHtml from "ansi-to-html";
import { useEffect, useState } from "react";
import Markdown from 'react-markdown';
import { updateTerminalLines } from "./updateTerminalLines";

const statusColor = {
  ok: "success",
  fail: "danger",
  error: "danger",
  running: "warning",
  idle: "secondary",
};

const ansiConverter = new AnsiToHtml({
  fg: '#e0e0e0',
  bg: '#181818',
  newline: true,
  escapeXML: true,
  stream: false,
});

export default function CalculationsTablePopup({ ws, configId, open, onClose }) {
  const [loading, setLoading] = useState(false);
  const [calculations, setCalculations] = useState([]);
  const [error, setError] = useState(null);
  const [hoveredRowId, setHoveredRowId] = useState(null);
  const [selectedMarkdown, setSelectedMarkdown] = useState(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setCalculations([]);

    if (!ws || ws.readyState !== WebSocket.OPEN || !configId) {
      setError("Нет соединения с сервером или не выбран конфиг.");
      setLoading(false);
      return;
    }

    ws.send(JSON.stringify({ command: "list_calculations", args: [configId] }));

    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (
          data.status === "ok" &&
          String(data.config_id) === String(configId) &&
          Array.isArray(data.calculations)
        ) {
          setCalculations(data.calculations);
          setLoading(false);
        } else if (data.status === "error") {
          setError(data.message || "Ошибка при получении отчётов");
          setLoading(false);
        }
      } catch (e) {
        setError("Ошибка при обработке ответа сервера");
        setLoading(false);
      }
      ws.removeEventListener("message", handleMessage);
    };

    ws.addEventListener("message", handleMessage);

    return () => {
      ws.removeEventListener("message", handleMessage);
    };
  }, [open, ws, configId]);

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
        tabIndex={-1}
        aria-modal="true"
        role="dialog"
      >
      <div className="modal-dialog modal-lg" style={{ pointerEvents: "auto", marginTop: "8vh", width: "80vw", maxWidth: "none" }}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Отчёты по конвейеру</h5>
            <button type="button" className="btn-close" aria-label="Close" onClick={() => { setSelectedMarkdown(null); onClose(); }} />
          </div>
          <div className="modal-body">
            {loading && <div>Загрузка...</div>}
            {error && <div className="alert alert-danger">{error}</div>}
            {!loading && !error && calculations.length === 0 && (
              <div className="text-muted">Нет отчётов для этого конвейера.</div>
            )}
            {!loading && !error && calculations.length > 0 && !selectedMarkdown && (
              <div style={{ overflowX: "auto" }}>
                <table className="table table-sm table-bordered align-middle">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Статус</th>
                      <th>Входные данные</th>
                      <th>Результат</th>
                      <th>Создано</th>
                      <th>Обновлено</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calculations.map((calc) => {
                      // Preprocess output using updateTerminalLines per line
                      const outputTmp = (calc.output || "").replaceAll("\n", "​\n").replaceAll("\r", "\n\r");
                      const linesArr = outputTmp.split("\n");
                      let processedLines = [];
                      for (const line of linesArr) {
                        processedLines = updateTerminalLines(processedLines, line.replaceAll("​", "\n"));
                      }
                      const processedOutput = processedLines.join("\n");
                      return (
                        <tr
                          key={calc.id}
                          onMouseEnter={() => setHoveredRowId(calc.id)}
                          onMouseLeave={() => setHoveredRowId(null)}
                          onClick={() => setSelectedMarkdown(processedOutput)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td style={hoveredRowId === calc.id ? { backgroundColor: '#e6f0fa' } : {}}>{calc.id}</td>
                          <td style={hoveredRowId === calc.id ? { backgroundColor: '#e6f0fa' } : {}}>
                            <span className={`badge bg-${statusColor[calc.status] || "secondary"}`}>
                              {calc.status}
                            </span>
                          </td>
                          <td style={hoveredRowId === calc.id ? { backgroundColor: '#e6f0fa' } : {}}>
                            <pre className="mb-0" style={{ fontSize: "0.9em", whiteSpace: "pre-wrap" }}>
                              {calc.input}
                            </pre>
                          </td>
                          <td style={hoveredRowId === calc.id ? { backgroundColor: '#e6f0fa' } : {}}>
                            <pre
                              className="mb-0"
                              style={{
                                fontSize: "0.9em",
                                whiteSpace: "pre-wrap",
                                background: "#181818",
                                color: "#e0e0e0",
                                borderRadius: 4,
                                padding: "6px",
                                border: "1px solid #333",
                              }}
                              dangerouslySetInnerHTML={{
                                __html: ansiConverter.toHtml(processedOutput),
                              }}
                            />
                          </td>
                          <td style={hoveredRowId === calc.id ? { backgroundColor: '#e6f0fa' } : {}}>{calc.created_at}</td>
                          <td style={hoveredRowId === calc.id ? { backgroundColor: '#e6f0fa' } : {}}>{calc.updated_at}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {selectedMarkdown && (
              <div>
                <button className="btn btn-secondary mb-3" onClick={() => setSelectedMarkdown(null)}>
                  Назад к таблице
                </button>
                <div style={{ maxHeight: '60vh', overflowY: 'auto', background: '#fff', padding: 16, borderRadius: 8, border: '1px solid #ccc' }}>
                  <Markdown>{selectedMarkdown}</Markdown>
                </div>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => { setSelectedMarkdown(null); onClose(); }}>
              Закрыть
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
