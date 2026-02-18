import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@buddy/ui";

export const Route = createFileRoute("/items")({
  component: ItemsComponent,
});

interface Item {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

function ItemsComponent() {
  const queryClient = useQueryClient();
  const [newItemName, setNewItemName] = useState("");
  const [newItemDescription, setNewItemDescription] = useState("");
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const { data: items, isLoading } = useQuery({
    queryKey: ["items"],
    queryFn: async () => {
      const res = await fetch("http://localhost:3000/items");
      if (!res.ok) throw new Error("Failed to fetch items");
      return res.json() as Promise<Item[]>;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const res = await fetch("http://localhost:3000/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create item");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      setNewItemName("");
      setNewItemDescription("");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; name?: string; description?: string }) => {
      const res = await fetch(`http://localhost:3000/items/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.name, description: data.description }),
      });
      if (!res.ok) throw new Error("Failed to update item");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      setEditingItem(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`http://localhost:3000/items/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete item");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;
    createMutation.mutate({
      name: newItemName,
      description: newItemDescription || undefined,
    });
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editName.trim()) return;
    updateMutation.mutate({
      id: editingItem.id,
      name: editName,
      description: editDescription || undefined,
    });
  };

  const startEdit = (item: Item) => {
    setEditingItem(item);
    setEditName(item.name);
    setEditDescription(item.description || "");
  };

  if (isLoading) {
    return <div className="p-4">Loading...</div>;
  }

  return (
    <div className="p-4 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Items</h1>

      <form onSubmit={handleCreate} className="mb-8 p-4 border rounded-lg">
        <h2 className="text-lg font-semibold mb-4">Create New Item</h2>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Name</label>
          <input
            type="text"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            className="w-full px-3 py-2 border rounded"
            placeholder="Enter item name"
            required
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Description (optional)</label>
          <input
            type="text"
            value={newItemDescription}
            onChange={(e) => setNewItemDescription(e.target.value)}
            className="w-full px-3 py-2 border rounded"
            placeholder="Enter description"
          />
        </div>
        <Button
          type="submit"
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? "Creating..." : "Create Item"}
        </Button>
      </form>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Your Items ({items?.length || 0})</h2>
        {items?.length === 0 ? (
          <p className="text-gray-500">No items yet. Create one above!</p>
        ) : (
          items?.map((item) => (
            <div key={item.id} className="p-4 border rounded-lg">
              {editingItem?.id === item.id ? (
                <form onSubmit={handleUpdate}>
                  <div className="mb-3">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-3 py-2 border rounded mb-2"
                      placeholder="Name"
                      required
                    />
                    <input
                      type="text"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="w-full px-3 py-2 border rounded"
                      placeholder="Description"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      disabled={updateMutation.isPending}
                      size="sm"
                    >
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setEditingItem(null)}
                      size="sm"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="mb-2">
                    <h3 className="font-semibold">{item.name}</h3>
                    {item.description && (
                      <p className="text-gray-600 text-sm">{item.description}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      Created: {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => startEdit(item)}
                      variant="secondary"
                      size="sm"
                    >
                      Edit
                    </Button>
                    <Button
                      onClick={() => deleteMutation.mutate(item.id)}
                      disabled={deleteMutation.isPending}
                      variant="destructive"
                      size="sm"
                    >
                      Delete
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
