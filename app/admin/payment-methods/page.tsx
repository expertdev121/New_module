import React, { useEffect, useState } from 'react';

type PaymentMethod = {
  id: number;
  name: string;
  description?: string;
  is_active: boolean;
  details: PaymentMethodDetail[];
};

type PaymentMethodDetail = {
  id: number;
  payment_method_id: number;
  key: string;
  value: string;
};

const PaymentMethodsPage = () => {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newMethod, setNewMethod] = useState({ name: '', description: '' });
  const [editing, setEditing] = useState<PaymentMethod | null>(null);

  useEffect(() => {
    fetchMethods();
  }, []);

  async function fetchMethods() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/payment-methods');
      const data = await res.json();
      setMethods(data.paymentMethods || []);
    } catch (e) {
      setError('Failed to load payment methods');
    }
    setLoading(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch('/api/admin/payment-methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMethod),
      });
      if (!res.ok) throw new Error('Failed to add');
      setShowAdd(false);
      setNewMethod({ name: '', description: '' });
      fetchMethods();
    } catch (e) {
      setError('Failed to add payment method');
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    try {
      const res = await fetch('/api/admin/payment-methods', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      });
      if (!res.ok) throw new Error('Failed to update');
      setEditing(null);
      fetchMethods();
    } catch (e) {
      setError('Failed to update payment method');
    }
  }

  if (loading) return <div>Loading...</div>;
  return (
    <div>
      <h1>Payment Methods</h1>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <button onClick={() => setShowAdd((v) => !v)}>
        {showAdd ? 'Cancel' : 'Add Payment Method'}
      </button>
      {showAdd && (
        <form onSubmit={handleAdd} style={{ margin: '1em 0' }}>
          <input
            required
            placeholder="Name"
            value={newMethod.name}
            onChange={(e) => setNewMethod((m) => ({ ...m, name: e.target.value }))}
          />
          <input
            placeholder="Description"
            value={newMethod.description}
            onChange={(e) => setNewMethod((m) => ({ ...m, description: e.target.value }))}
          />
          <button type="submit">Add</button>
        </form>
      )}
      <table border={1} cellPadding={6} style={{ marginTop: 16, width: '100%' }}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Description</th>
            <th>Status</th>
            <th>Details</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {methods.map((m) => (
            <tr key={m.id}>
              <td>{m.name}</td>
              <td>{m.description}</td>
              <td>{m.is_active ? 'Active' : 'Inactive'}</td>
              <td>
                <ul>
                  {m.details?.map((d) => (
                    <li key={d.id}>
                      <b>{d.key}:</b> {d.value}
                    </li>
                  ))}
                </ul>
              </td>
              <td>
                <button onClick={() => setEditing(m)}>Edit</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && (
        <form onSubmit={handleUpdate} style={{ margin: '2em 0', border: '1px solid #ccc', padding: 16 }}>
          <h3>Edit Payment Method</h3>
          <input
            required
            placeholder="Name"
            value={editing.name}
            onChange={(e) => setEditing((m) => m ? { ...m, name: e.target.value } : m)}
          />
          <input
            placeholder="Description"
            value={editing.description}
            onChange={(e) => setEditing((m) => m ? { ...m, description: e.target.value } : m)}
          />
          <label>
            <input
              type="checkbox"
              checked={editing.is_active}
              onChange={(e) => setEditing((m) => m ? { ...m, is_active: e.target.checked } : m)}
            />{' '}
            Active
          </label>
          <button type="submit">Update</button>
          <button type="button" onClick={() => setEditing(null)} style={{ marginLeft: 8 }}>
            Cancel
          </button>
        </form>
      )}
    </div>
  );
};

export default PaymentMethodsPage;
