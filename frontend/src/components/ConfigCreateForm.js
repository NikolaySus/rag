import React, { useEffect, useState } from "react";

const COMPONENTS = ["indexer", "retriever", "augmenter", "generator"];

const ConfigCreateForm = ({ ws, onClose, onCreated }) => {
  const [loading, setLoading] = useState(true);
  const [registry, setRegistry] = useState({});
  const [defaultConfig, setDefaultConfig] = useState({});
  const [form, setForm] = useState({
    name: "",
    indexer: "",
    retriever: "",
    augmenter: "",
    generator: "",
  });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Fetch registry and default config on mount
  useEffect(() => {
    if (!ws) return;
    let didSend = false;

    const sendCreationInfo = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ command: "config_creation_info", args: [] }));
        didSend = true;
      }
    };

    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === "ok" && data.registry && data.default_config) {
          setRegistry(data.registry);
          setDefaultConfig(data.default_config);
          setForm((prev) => ({
            ...prev,
            ...Object.fromEntries(
              COMPONENTS.map((c) => [c, data.default_config[c]?.path || ""])
            ),
          }));
          setLoading(false);
        }
      } catch (e) {}
    };

    if (ws.readyState === WebSocket.OPEN) {
      sendCreationInfo();
    } else if (ws.readyState === WebSocket.CONNECTING) {
      ws.addEventListener("open", sendCreationInfo, { once: true });
    }

    ws.addEventListener("message", handleMessage);

    return () => {
      if (!didSend && ws.readyState === WebSocket.CONNECTING) {
        ws.removeEventListener("open", sendCreationInfo, { once: true });
      }
      ws.removeEventListener("message", handleMessage);
    };
    // eslint-disable-next-line
  }, [ws]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    // Build config JSON
    const configJson = {};
    COMPONENTS.forEach((c) => {
      configJson[c] = {
        path: form[c],
        settings: {}, // settings ignored for now
      };
    });

    const message = {
      command: "config",
      args: [
        form.name,
        "calculation",
        JSON.stringify(configJson),
      ],
    };

    let didSend = false;

    const handleResponse = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === "ok") {
          ws.removeEventListener("message", handleResponse);
          setSubmitting(false);
          onCreated && onCreated();
          onClose && onClose();
        } else if (data.status === "error") {
          setError(data.message || "Error creating config");
          setSubmitting(false);
          ws.removeEventListener("message", handleResponse);
        }
      } catch (e) {}
    };

    ws.addEventListener("message", handleResponse);

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      didSend = true;
    }

    // Clean up in case modal closes before response
    return () => {
      if (!didSend && ws.readyState === WebSocket.CONNECTING) {
        ws.removeEventListener("open", handleSubmit, { once: true });
      }
      ws.removeEventListener("message", handleResponse);
    };
  };

  if (loading) {
    return (
      <div className="p-3">
        <div className="text-secondary">Loading form...</div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="p-3">
      <h5>Create New Config</h5>
      <div className="mb-3">
        <label className="form-label">Name</label>
        <input
          className="form-control"
          name="name"
          value={form.name}
          onChange={handleChange}
          required
          disabled={submitting}
        />
      </div>
      {COMPONENTS.map((comp) => (
        <div className="mb-3" key={comp}>
          <label className="form-label text-capitalize">{comp}</label>
          <select
            className="form-select"
            name={comp}
            value={form[comp]}
            onChange={handleChange}
            required
            disabled={submitting}
          >
            {Object.entries(registry[comp] || {}).map(([path, id]) => (
              <option value={path} key={id}>
                {path}
              </option>
            ))}
          </select>
        </div>
      ))}
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="d-flex justify-content-end">
        <button
          type="button"
          className="btn btn-secondary me-2"
          onClick={onClose}
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={submitting}
        >
          {submitting ? "Creating..." : "Create"}
        </button>
      </div>
    </form>
  );
};

export default ConfigCreateForm;
