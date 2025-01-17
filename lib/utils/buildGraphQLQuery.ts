import capitalize from "./capitalize";

type Fields = {
  [key: string]: boolean | Fields;
};

/**
 * Builds a GraphQL query string from a fields object.
 *
 * @param queryName - The name of the query
 * @param fields - The fields object
 */
function buildGraphQLQuery(
  queryType: "query" | "mutation",
  queryName: string,
  fields: Fields,
  variables: Record<string, any>
): string {
  const processFields = (fields: Fields): string => {
    return Object.entries(fields)
      .map(([key, value]) => {
        if (value === true) {
          return key; // Leaf field
        } else if (typeof value === "object") {
          return `${key} { ${processFields(value)} }`; // Nested fields
        } else {
          throw new Error(`Invalid value for field "${key}": ${value}`);
        }
      })
      .join(" ");
  };

  const fieldString = processFields(fields);

  // Include variables if we have any
  const variablesString = Object.entries(variables)
    .map(([key, value]) => `${key}: "${value}"`)
    .join(", ");
  const variablesTemplate = variablesString ? `(${variablesString})` : "";

  return `
    ${queryType} ${capitalize(queryName)} {
      ${queryName}${variablesTemplate} {
        ${fieldString}
      }
    }
  `;
}

export default buildGraphQLQuery;
