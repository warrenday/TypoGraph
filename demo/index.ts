import { query } from "./urql-client";

const res = await query(
  "getUser",
  {
    id: true,
    name: true,
  },
  {
    variables: {
      id: "1",
    },
  }
);

console.log(res.data?.getUser.id);
