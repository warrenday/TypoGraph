import { useState } from "react";
import { useQuery, useMutation } from "./main";

export function App() {
  const { data, loading, error, refetch } = useQuery({
    message: { id: true, text: true },
  });
  const [setMessage, { loading: saving }] = useMutation({
    setMessage: { id: true, text: true },
  });
  const [draft, setDraft] = useState("");

  return (
    <main style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>typograph + apollo + apollo</h1>
      {loading && <p>loading…</p>}
      {error && <p style={{ color: "red" }}>{error.message}</p>}
      {data && (
        <p>
          <strong>message:</strong> {data.message.text}
        </p>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!draft) return;
          await setMessage({ text: draft });
          setDraft("");
          await refetch();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="new message…"
        />
        <button type="submit" disabled={saving}>
          set
        </button>
      </form>
    </main>
  );
}
