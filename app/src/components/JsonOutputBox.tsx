type JsonOutputBoxProps = {
  title: string;
  value: unknown;
};

const renderValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export const JsonOutputBox = ({ title, value }: JsonOutputBoxProps) => {
  return (
    <div className="json-output-box">
      <h6>{title}</h6>
      <pre>{renderValue(value)}</pre>
    </div>
  );
};
