// Helper function to check if a value is a plain object (and not an array).
const isObject = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === "object" && !Array.isArray(value);
};

export default isObject;
