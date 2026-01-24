import { Replicache, type WriteTransaction } from 'replicache';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Get auth token from localStorage
function getAuthToken(): string | null {
  return localStorage.getItem('token');
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  version: number;
}

export type ReplicacheMutators = {
  updateUser: (tx: WriteTransaction, updates: { name?: string }) => Promise<void>;
};

export function createReplicache(userId: string) {
  const rep = new Replicache({
    name: `user-${userId}`,
    licenseKey: import.meta.env.VITE_REPLICACHE_LICENSE_KEY || '',
    
    // Define your mutators here
    mutators: {
      // Update user profile
      updateUser: async (tx: WriteTransaction, updates: { name?: string }) => {
        const user = (await tx.get(`user/${userId}`)) as User | undefined;
        if (user) {
          await tx.set(`user/${userId}`, { ...user, ...updates });
        }
      },

      // Example mutators for other data - customize based on your data model
      // async createItem(tx, item) {
      //   await tx.set(`item/${item.id}`, item);
      // },
      // async updateItem(tx, { id, ...updates }) {
      //   const item = await tx.get(`item/${id}`);
      //   if (item) {
      //     await tx.set(`item/${id}`, { ...item, ...updates });
      //   }
      // },
      // async deleteItem(tx, id) {
      //   await tx.del(`item/${id}`);
      // },
    },

    // Pull function - fetches changes from the server
    puller: async (req) => {
      const token = getAuthToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      const response = await fetch(`${API_URL}/replicache/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(req),
      });

      if (!response.ok) {
        throw new Error(`Pull failed: ${response.statusText}`);
      }

      return await response.json();
    },

    // Push function - sends local changes to the server
    pusher: async (req) => {
      const token = getAuthToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      const response = await fetch(`${API_URL}/replicache/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(req),
      });

      if (!response.ok) {
        throw new Error(`Push failed: ${response.statusText}`);
      }

      return await response.json();
    },
  });

  return rep as typeof rep & {
    mutate: ReplicacheMutators;
  };
}

// Hook to use Replicache in components
// Uncomment and use in your components when ready
// import { useState, useEffect } from 'react';
// import { useAuth } from '@/hooks/useAuth';
//
// export function useReplicache() {
//   const { user } = useAuth();
//   const [rep, setRep] = useState<ReturnType<typeof createReplicache> | null>(null);
//
//   useEffect(() => {
//     if (user) {
//       const r = createReplicache(user.id);
//       setRep(r);
//       return () => {
//         r.close();
//       };
//     }
//   }, [user]);
//
//   return rep;
// }
