import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useQuery, useMutation } from "./main";

export function App() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    message: { id: true, text: true },
  });
  const setMessage = useMutation(
    { setMessage: { id: true, text: true } },
    {
      onSuccess: () => queryClient.invalidateQueries(),
    }
  );
  const [draft, setDraft] = useState("");

  return (
    <main style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>typograph + yoga + react-query</h1>
      {isLoading && <p>loading…</p>}
      {error && <p style={{ color: "red" }}>{error.message}</p>}
      {data && (
        <p>
          <strong>message:</strong> {data.message.text}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft) return;
          setMessage.mutate({ text: draft }, { onSuccess: () => setDraft("") });
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="new message…"
        />
        <button type="submit" disabled={setMessage.isPending}>
          set
        </button>
      </form>
    </main>
  );
}
