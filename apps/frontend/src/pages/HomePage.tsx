import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { createReplicache, type User } from '@/lib/replicache';
import { useSubscribe } from 'replicache-react';

export function HomePage() {
  const { user, logout } = useAuth();
  const [rep, setRep] = useState<ReturnType<typeof createReplicache> | null>(null);
  const [editName, setEditName] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // Initialize Replicache
  useEffect(() => {
    if (user) {
      const r = createReplicache(user.id);
      setRep(r);
      return () => {
        r.close();
      };
    }
  }, [user]);

  // Subscribe to user data from Replicache
  const replicacheUser = useSubscribe(
    rep,
    async (tx) => {
      if (!user?.id) return null;
      return (await tx.get(`user/${user.id}`)) as User | undefined;
    },
    undefined
  );

  // Use Replicache data if available, otherwise fall back to auth context
  const displayUser = replicacheUser || user;

  const handleUpdateName = async () => {
    if (!rep || !editName.trim()) return;

    try {
      await rep.mutate.updateUser({ name: editName });
      setIsEditing(false);
      setEditName('');
    } catch (error) {
      console.error('Failed to update user:', error);
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <h1 className="text-4xl font-bold">Welcome to Unitae</h1>
          <Button onClick={logout} variant="outline">
            Logout
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>User Profile</CardTitle>
            <CardDescription>Your account information (synced with Replicache)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <span className="font-medium">Email:</span> {displayUser?.email}
            </div>
            <div>
              <span className="font-medium">Name:</span>{' '}
              {isEditing ? (
                <div className="inline-flex items-center gap-2 mt-2">
                  <Input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-64"
                  />
                  <Button onClick={handleUpdateName} size="sm">
                    Save
                  </Button>
                  <Button
                    onClick={() => {
                      setIsEditing(false);
                      setEditName('');
                    }}
                    variant="outline"
                    size="sm"
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <span>
                  {displayUser?.name || 'Not set'}{' '}
                  <Button
                    onClick={() => {
                      setEditName(displayUser?.name || '');
                      setIsEditing(true);
                    }}
                    variant="link"
                    size="sm"
                    className="p-0 h-auto"
                  >
                    (Edit)
                  </Button>
                </span>
              )}
            </div>
            <div>
              <span className="font-medium">User ID:</span> {displayUser?.id}
            </div>
            {replicacheUser && (
              <div className="text-xs text-muted-foreground">
                <span className="font-medium">Sync Status:</span> Connected to Replicache
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Local-First Application</CardTitle>
            <CardDescription>Built with NestJS, React, and Replicache</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              This is a local-first application template with authentication. 
              The user profile above is synced using Replicache for offline-first data synchronization.
              Try editing your name - it will sync in real-time and work offline!
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
