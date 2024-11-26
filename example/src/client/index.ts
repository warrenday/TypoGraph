import { useQuery } from "urql";
import { createClient } from "../../../src";
import { type TypeDefs } from "../../server/entitiies/index";

const client = createClient<TypeDefs>();

const useQueryWrapper = <
  Q extends Parameters<typeof client.query>[0],
  S extends Parameters<typeof client.query>[1]
>(
  query: Q,
  selection: S
) => {
  const user = client.query(query, selection);

  const [result] = useQuery({
    query: user.toGraphQL(),
  });

  return {
    ...result,
    data: result.data as typeof user.types,
  };
};

const run = async () => {
  const { data } = useQueryWrapper("getUser", {
    id: true,
    name: true,
  });

  data.id;
};

run();
