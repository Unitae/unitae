import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function HomePage() {
  const { user, logout } = useAuth();

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
            <CardDescription>Your account information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <span className="font-medium">Email:</span> {user?.email}
            </div>
            {user?.name && (
              <div>
                <span className="font-medium">Name:</span> {user.name}
              </div>
            )}
            <div>
              <span className="font-medium">User ID:</span> {user?.id}
            </div>
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
              You can extend this with Replicache/Zero for offline-first data synchronization.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
