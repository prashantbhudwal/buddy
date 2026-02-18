import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: IndexComponent,
});

function IndexComponent() {
  return (
    <div className="p-2">
      <h3>Welcome to Buddy!</h3>
      <p>This is a simple CRUD demo to verify the monorepo setup.</p>
    </div>
  );
}
