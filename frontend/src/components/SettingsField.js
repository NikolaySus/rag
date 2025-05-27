
/**
 * SettingsField
 * @param {object} props
 * @param {object} props.settings - The settings object (key-value pairs)
 * @param {function} props.onChange - Called with (key, value) when a field changes
 * @param {boolean} props.disabled
 */
const SettingsField = ({ settings = {}, onChange, disabled }) => {
  if (!settings || typeof settings !== "object") return null;

  return (
    <div className="mb-3">
      <label className="form-label">Settings</label>
      <div className="row">
        {Object.entries(settings).map(([key, value]) => (
          <div className="col-12 col-md-6 mb-2" key={key}>
            <div className="input-group">
              <span className="input-group-text" style={{ minWidth: 120 }}>{key}</span>
              <input
                type="text"
                className="form-control"
                value={value === null || value === undefined ? "" : value}
                disabled={disabled}
                onChange={e => onChange(key, e.target.value)}
                aria-label={key}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SettingsField;