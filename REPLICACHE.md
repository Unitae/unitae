# Replicache Integration Guide

This guide explains how to use and extend the Replicache/Zero sync functionality in the Unitae monorepo.

## Overview

Replicache is a local-first sync engine that enables offline-first applications. The backend provides two main endpoints for synchronization:

- **Pull**: Fetch changes from the server
- **Push**: Send local mutations to the server

## Backend Architecture

### Entities

**ReplicacheClient**
- Tracks each client's last mutation ID
- Prevents duplicate mutation processing
- Fields: `id`, `clientId`, `userId`, `lastMutationId`

**ReplicacheSpaceVersion**
- Tracks version history for each user's data space
- Used to determine what changes to send during pulls
- Fields: `id`, `spaceId`, `version`

### Endpoints

#### POST /replicache/pull

Fetches changes from the server since the last pull.

**Request:**
```json
{
  "clientID": "unique-client-id",
  "cookie": {
    "version": 0
  }
}
```

**Response:**
```json
{
  "cookie": {
    "version": 1,
    "clientID": "unique-client-id"
  },
  "lastMutationID": 5,
  "patch": [
    {
      "op": "put",
      "key": "item/123",
      "value": { "id": "123", "name": "Item Name" }
    }
  ]
}
```

#### POST /replicache/push

Sends local mutations to the server.

**Request:**
```json
{
  "clientID": "unique-client-id",
  "mutations": [
    {
      "id": 1,
      "name": "createItem",
      "args": { "id": "123", "name": "New Item" }
    }
  ]
}
```

**Response:**
```json
{
  "success": true
}
```

## Frontend Integration

### Basic Setup

```typescript
import { createReplicache } from '@/lib/replicache';
import { useAuth } from '@/hooks/useAuth';

function MyComponent() {
  const { user } = useAuth();
  const [rep, setRep] = useState<Replicache | null>(null);

  useEffect(() => {
    if (user) {
      const r = createReplicache(user.id);
      setRep(r);
      return () => r.close();
    }
  }, [user]);

  // Use rep for mutations and queries
}
```

### Defining Mutators

Edit `apps/frontend/src/lib/replicache.ts`:

```typescript
mutators: {
  async createItem(tx, item: { id: string; name: string }) {
    await tx.put(`item/${item.id}`, item);
  },
  
  async updateItem(tx, { id, ...updates }: any) {
    const item = await tx.get(`item/${id}`);
    if (item) {
      await tx.put(`item/${id}`, { ...item, ...updates });
    }
  },
  
  async deleteItem(tx, id: string) {
    await tx.del(`item/${id}`);
  },
}
```

### Using Mutators

```typescript
// Create an item
await rep.mutate.createItem({
  id: crypto.randomUUID(),
  name: 'My New Item'
});

// Update an item
await rep.mutate.updateItem({
  id: 'item-123',
  name: 'Updated Name'
});

// Delete an item
await rep.mutate.deleteItem('item-123');
```

### Querying Data

```typescript
import { useSubscribe } from 'replicache-react';

function ItemsList() {
  const items = useSubscribe(
    rep,
    async (tx) => {
      const list = [];
      for await (const [key, value] of tx.scan({ prefix: 'item/' })) {
        list.push(value);
      }
      return list;
    },
    []
  );

  return (
    <ul>
      {items.map(item => (
        <li key={item.id}>{item.name}</li>
      ))}
    </ul>
  );
}
```

## Backend Implementation Guide

### 1. Create Your Data Entities

Create entities for your business logic:

```typescript
// apps/backend/src/items/item.entity.ts
@Entity('items')
export class Item {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  name: string;

  @Column({ type: 'integer' })
  version: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### 2. Implement the Pull Logic

In `replicache.service.ts`, update the `pull` method:

```typescript
async pull(userId: string, pullRequest: PullRequestDto) {
  const spaceId = `user-${userId}`;
  let spaceVersion = await this.getSpaceVersion(spaceId);
  const client = await this.getOrCreateClient(pullRequest.clientID, userId);
  const lastPulledVersion = pullRequest.cookie?.version || 0;

  const patch = [];

  // Fetch items changed since last pull
  const items = await this.itemsRepository.find({
    where: {
      userId,
      version: MoreThan(lastPulledVersion)
    }
  });

  patch.push(...items.map(item => ({
    op: 'put',
    key: `item/${item.id}`,
    value: item
  })));

  return {
    cookie: {
      version: spaceVersion,
      clientID: pullRequest.clientID,
    },
    lastMutationID: client.lastMutationId,
    patch,
  };
}
```

### 3. Implement Mutation Handlers

In `replicache.service.ts`, update the `processMutation` method:

```typescript
private async processMutation(userId: string, mutation: any) {
  switch (mutation.name) {
    case 'createItem':
      await this.itemsService.create({
        ...mutation.args,
        userId,
      });
      break;
      
    case 'updateItem':
      await this.itemsService.update(
        userId,
        mutation.args.id,
        mutation.args
      );
      break;
      
    case 'deleteItem':
      await this.itemsService.delete(userId, mutation.args);
      break;
      
    default:
      console.warn(`Unknown mutation: ${mutation.name}`);
  }
}
```

### 4. Version Tracking

Make sure to increment the version field whenever data changes:

```typescript
async create(userId: string, data: CreateItemDto) {
  const spaceVersion = await this.replicacheService.incrementSpaceVersion(`user-${userId}`);
  
  const item = this.itemsRepository.create({
    ...data,
    userId,
    version: spaceVersion,
  });
  
  return this.itemsRepository.save(item);
}
```

## Testing

### Test Pull Endpoint

```bash
curl -X POST http://localhost:3000/replicache/pull \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "clientID": "test-client",
    "cookie": {"version": 0}
  }'
```

### Test Push Endpoint

```bash
curl -X POST http://localhost:3000/replicache/push \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "clientID": "test-client",
    "mutations": [
      {
        "id": 1,
        "name": "createItem",
        "args": {"id": "123", "name": "Test"}
      }
    ]
  }'
```

## Best Practices

1. **Always increment space version** when data changes
2. **Use optimistic mutations** on the frontend for instant UI updates
3. **Handle conflicts** gracefully when the same data is modified on multiple devices
4. **Keep mutations idempotent** so they can be safely retried
5. **Test offline scenarios** to ensure proper sync when reconnecting
6. **Monitor mutation IDs** to prevent processing duplicates

## Troubleshooting

### Mutations not syncing

- Check that space version is incrementing on the backend
- Verify JWT token is valid and being sent
- Check backend logs for mutation processing errors

### Pull not returning data

- Ensure entities have a `version` field
- Verify the pull query is filtering by version correctly
- Check that data is being saved with the correct `userId`

### Conflicts on sync

- Implement last-write-wins or custom conflict resolution
- Consider using timestamps for conflict detection
- Test with multiple clients modifying the same data

## Additional Resources

- [Replicache Documentation](https://doc.replicache.dev/)
- [Zero Documentation](https://zerosync.dev/)
- [Local-First Software Principles](https://www.inkandswitch.com/local-first/)
