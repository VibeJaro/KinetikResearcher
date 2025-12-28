type JsonOutputBoxProps = {
  title: string;
  value: unknown;
};

export const JsonOutputBox = ({ title, value }: JsonOutputBoxProps) => {
  let content = "";

  if (typeof value === "string") {
    content = value;
  } else if (value !== null && value !== undefined) {
    try {
      content = JSON.stringify(value, null, 2);
    } catch (error) {
      content = `[[unserializable value]] ${String(error)}`;
    }
  }

  return (
    <div className="json-output-box">
      <div className="json-output-header">
        <h6>{title}</h6>
      </div>
      <pre className="json-output-content">{content || "—"}</pre>
    </div>
  );
};

