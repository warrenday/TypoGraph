// Helper function to check if value is an object
const isObject = (item: any): boolean => {
  return item && typeof item === "object" && !Array.isArray(item);
};

export default isObject;
