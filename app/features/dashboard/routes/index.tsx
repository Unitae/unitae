import {
  AlertTriangle,
  CalendarOff,
  CalendarPlus,
  ChevronRight,
  FileText,
  Info,
  MapPin,
  Mic,
  Plus,
} from "lucide-react";
import { Link } from "react-router";

import {
  getNextMeeting,
  getRecentDocuments,
  getUnreadDocumentCount,
  getUpcomingAbsences,
  getUserTerritories,
  type TerritoryStatus,
} from "~/features/dashboard/server/dashboard.server";
import { buildUrgentItems } from "~/features/dashboard/ui/build-urgent-items";
import { OnboardingChecklist } from "~/features/dashboard/ui/OnboardingChecklist";
import * as m from "~/paraglide/messages";
import {
  permissionsContext,
  userContext,
  withScopeFromContext,
} from "~/shared/auth/route-context.server";
import logger from "~/shared/infra/logger.server";
import { Role } from "~/shared/types/role";
import { Alert, AlertDescription } from "~/shared/ui/alert";
import { Badge } from "~/shared/ui/badge";
import { Button } from "~/shared/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/shared/ui/card";
import { EmptyState } from "~/shared/ui/EmptyState";
import { RelativeTime } from "~/shared/ui/RelativeTime";

import type { Route } from "./+types/index";

export const meta: Route.MetaFunction = () => {
  return [{ title: "Accueil - Unitae" }];
};

async function safeQuery<T>(
  label: string,
  userId: number,
  fn: () => Promise<T>,
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    logger.error(
      `Dashboard widget "${label}" failed for user ${userId}`,
      error,
    );
    return null;
  }
}

export function loader({ context }: Route.LoaderArgs) {
  const currentUser = context.get(userContext);
  const permissions = context.get(permissionsContext);
  const isAdmin = permissions.has(Role.Admin);
  const isTerritoriesManager = permissions.has(Role.TerritoriesManager);

  return withScopeFromContext(context, async (db) => {
    const [
      territories,
      recentDocuments,
      unreadDocumentCount,
      absences,
      nextMeeting,
    ] = await Promise.all([
      safeQuery("territories", currentUser.id, () =>
        getUserTerritories(db, currentUser.id),
      ),
      safeQuery("documents", currentUser.id, () =>
        getRecentDocuments(db, currentUser.id, currentUser.congregationId),
      ),
      safeQuery("unread-count", currentUser.id, () =>
        getUnreadDocumentCount(db, currentUser.id, currentUser.congregationId),
      ),
      safeQuery("absences", currentUser.id, () =>
        getUpcomingAbsences(db, currentUser.id, currentUser.congregationId),
      ),
      safeQuery("next-meeting", currentUser.id, () =>
        getNextMeeting(db, currentUser.id),
      ),
    ]);

    // Onboarding: count entities for admin checklist
    let onboarding = null;
    if (isAdmin) {
      const [publisherCount, territoryCount, documentCount] = await Promise.all(
        [
          safeQuery("onboarding-publishers", currentUser.id, () =>
            db.user.count({ where: { isPublisher: true } }),
          ),
          safeQuery("onboarding-territories", currentUser.id, () =>
            db.territory.count(),
          ),
          safeQuery("onboarding-documents", currentUser.id, () =>
            db.boardDocument.count(),
          ),
        ],
      );
      // Only show onboarding if all counts loaded successfully — avoid showing
      // misleading "incomplete setup" when the database query failed
      if (
        publisherCount != null &&
        territoryCount != null &&
        documentCount != null
      ) {
        onboarding = { publisherCount, territoryCount, documentCount };
      }
    }

    return {
      currentUser: { firstname: currentUser.firstname },
      territories,
      recentDocuments,
      unreadDocumentCount,
      nextMeeting,
      absences,
      onboarding,
      isAdmin,
      isTerritoriesManager,
    };
  });
}

const statusVariant: Record<
  TerritoryStatus,
  "success" | "warning" | "destructive"
> = {
  "on-time": "success",
  "due-soon": "warning",
  overdue: "destructive",
};

function statusLabel(status: TerritoryStatus): string {
  if (status === "on-time") return m.dashboard_territory_on_time();
  if (status === "due-soon") return m.dashboard_territory_due_soon();
  return m.dashboard_territory_overdue();
}

function formatDateShort(date: Date | string): string {
  return new Date(date).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const {
    currentUser,
    territories,
    recentDocuments,
    unreadDocumentCount,
    nextMeeting,
    absences,
    onboarding,
    isAdmin,
    isTerritoriesManager,
  } = loaderData;

  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Build urgent items from across features
  const urgentItems = buildUrgentItems(
    territories,
    unreadDocumentCount,
    nextMeeting,
    absences?.upcoming ?? null,
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      {/* Hero greeting */}
      <div className="flex animate-fade-in-up flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="font-display text-lg text-muted-foreground tracking-tight sm:text-xl">
            {m.dashboard_greeting_hello()}
          </p>
          <h1 className="font-display font-semibold text-4xl tracking-tight md:text-5xl">
            {currentUser.firstname ?? ""}
          </h1>
          <p className="mt-2 text-muted-foreground">{today}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/me/days-off/new">
              <CalendarPlus className="size-4" />
              {m.dashboard_quick_action_plan_absence()}
            </Link>
          </Button>
          {(isAdmin || isTerritoriesManager) && (
            <Button variant="outline" size="sm" asChild>
              <Link to="/territories/attributions/new/available-territories">
                <MapPin className="size-4" />
                {m.dashboard_quick_action_assign_territory()}
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Onboarding checklist (admin only) */}
      {onboarding && (
        <OnboardingChecklist
          publisherCount={onboarding.publisherCount}
          territoryCount={onboarding.territoryCount}
          documentCount={onboarding.documentCount}
        />
      )}

      {/* Urgent strip */}
      {urgentItems.length > 0 && (
        <div
          className="flex animate-fade-in-up flex-col gap-2"
          style={{ animationDelay: "100ms" }}
        >
          {urgentItems.map((item) => (
            <Link
              key={item.key}
              to={item.to}
              className={`flex items-center gap-3 rounded-lg border-l-4 px-4 py-3 transition-colors hover:bg-muted/50 ${item.borderClass}`}
            >
              <item.icon className={`size-4 shrink-0 ${item.iconClass}`} />
              <span className="flex-1 font-medium text-sm">{item.label}</span>
              <span className="text-muted-foreground text-xs">
                {item.relativeDate && <RelativeTime date={item.relativeDate} />}
              </span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}

      {/* Widget grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="animate-fade-in-up" style={{ animationDelay: "150ms" }}>
          <TerritoriesCard territories={territories} />
        </div>
        <div className="animate-fade-in-up" style={{ animationDelay: "200ms" }}>
          <NextMeetingCard meeting={nextMeeting} />
        </div>
        <div className="animate-fade-in-up" style={{ animationDelay: "250ms" }}>
          <DocumentsCard documents={recentDocuments} />
        </div>
        <div className="animate-fade-in-up" style={{ animationDelay: "300ms" }}>
          <AbsencesCard
            absences={absences?.upcoming ?? null}
            shouldNudge={absences?.shouldNudge ?? false}
          />
        </div>
      </div>
    </div>
  );
}

// --- Widget components ---

function WidgetError() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
      <AlertTriangle className="size-4 shrink-0" />
      <span className="text-sm">{m.dashboard_widget_error()}</span>
    </div>
  );
}

function TerritoriesCard({
  territories,
}: {
  territories: Awaited<ReturnType<typeof getUserTerritories>> | null;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{m.dashboard_my_territories()}</CardTitle>
      </CardHeader>
      <CardContent>
        {territories == null ? (
          <WidgetError />
        ) : territories.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title={m.dashboard_no_territories()}
            description={m.dashboard_empty_territories_guidance()}
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            {territories.map((t) => (
              <Link
                key={t.id}
                to={`/me/territories/${t.territory.id}`}
                className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">
                    {t.territory.number}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    <RelativeTime date={t.lateDate} />
                  </span>
                </div>
                <Badge variant={statusVariant[t.status]} className="text-xs">
                  {statusLabel(t.status)}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter className="mt-auto">
        <Button variant="link" asChild className="px-0">
          <Link to="/me/territories">{m.dashboard_view_all()}</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function NextMeetingCard({
  meeting,
}: {
  meeting: Awaited<ReturnType<typeof getNextMeeting>> | null;
}) {
  if (meeting === null) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>{m.dashboard_next_meeting()}</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState icon={Mic} title={m.dashboard_next_meeting_no_event()} />
        </CardContent>
      </Card>
    );
  }

  const meetingDate = new Date(meeting.startDate).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const hasUserAssignments =
    meeting.userPartIds.length > 0 || meeting.userServiceRoleIds.length > 0;

  return (
    <Card className="h-full">
      <CardHeader>
        <div>
          <CardTitle>{m.dashboard_next_meeting()}</CardTitle>
          <p className="mt-0.5 text-muted-foreground text-sm">
            {meeting.name} — {meetingDate}
          </p>
        </div>
      </CardHeader>
      <CardContent>
        {!hasUserAssignments ? (
          <p className="text-muted-foreground text-sm">
            {m.dashboard_next_meeting_no_assignments()}
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {meeting.partAssignments
              .filter((p) => meeting.userPartIds.includes(p.id))
              .map((part) => {
                const isAssignee =
                  part.assignee &&
                  meeting.userPartIds.includes(part.id) &&
                  part.assignee.id !== part.assistant?.id;
                const roleLabel = isAssignee
                  ? m.dashboard_next_meeting_assigned_as_speaker()
                  : m.dashboard_next_meeting_assigned_as_assistant();

                return (
                  <div
                    key={part.id}
                    className="rounded-lg bg-primary/5 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm">{part.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {roleLabel}
                      </Badge>
                    </div>
                    {part.topic && (
                      <p className="mt-0.5 text-muted-foreground text-xs">
                        {part.topic}
                      </p>
                    )}
                  </div>
                );
              })}
            {meeting.serviceRoleAssignments
              .filter((r) => meeting.userServiceRoleIds.includes(r.id))
              .map((role) => (
                <div
                  key={role.id}
                  className="flex items-center justify-between rounded-lg bg-primary/5 px-3 py-2"
                >
                  <span className="font-medium text-sm">{role.name}</span>
                  <Badge variant="outline" className="text-xs">
                    {m.dashboard_next_meeting_assigned_as_service()}
                  </Badge>
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DocumentsCard({
  documents,
}: {
  documents: Awaited<ReturnType<typeof getRecentDocuments>> | null;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{m.dashboard_recent_documents()}</CardTitle>
      </CardHeader>
      <CardContent>
        {documents == null ? (
          <WidgetError />
        ) : documents.length === 0 ? (
          <EmptyState icon={FileText} title={m.dashboard_no_documents()} />
        ) : (
          <div className="flex flex-col gap-1">
            {documents.map((doc) => (
              <Link
                key={`${doc.kind}-${doc.id}`}
                to={
                  doc.kind === "pdf"
                    ? `/board/documents/${doc.id}/viewer`
                    : `/board/dynamic/${doc.id}/viewer`
                }
                className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted/50"
              >
                {!doc.alreadyViewed && (
                  <span className="size-2 shrink-0 rounded-full bg-primary" />
                )}
                {doc.alreadyViewed && <span className="size-2 shrink-0" />}
                <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <span
                    className={`truncate text-sm ${doc.alreadyViewed ? "text-muted-foreground" : "font-medium"}`}
                  >
                    {doc.title}
                  </span>
                  <span className="shrink-0 text-muted-foreground text-xs">
                    <RelativeTime date={doc.createdAt} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter className="mt-auto">
        <Button variant="link" asChild className="px-0">
          <Link to="/board">{m.dashboard_view_all()}</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function AbsencesCard({
  absences,
  shouldNudge,
}: {
  absences: Awaited<ReturnType<typeof getUpcomingAbsences>>["upcoming"] | null;
  shouldNudge: boolean;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{m.dashboard_my_absences()}</CardTitle>
          <Button variant="ghost" size="icon-xs" asChild>
            <Link to="/me/days-off/new">
              <Plus className="size-4" />
              <span className="sr-only">
                {m.dashboard_quick_action_plan_absence()}
              </span>
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {absences == null ? (
          <WidgetError />
        ) : (
          <>
            {shouldNudge && (
              <Alert className="mb-3 border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-400">
                <Info className="size-4" />
                <AlertDescription>
                  {m.dashboard_absence_nudge()}
                </AlertDescription>
              </Alert>
            )}
            {absences.length === 0
              ? !shouldNudge && (
                  <EmptyState
                    icon={CalendarOff}
                    title={m.dashboard_no_absences()}
                    action={
                      <Button variant="outline" size="sm" asChild>
                        <Link to="/me/days-off/new">
                          {m.dashboard_plan_absence()}
                        </Link>
                      </Button>
                    }
                  />
                )
              : absences.map((a) => (
                  <Link
                    key={a.id}
                    to="/me/days-off"
                    className="flex items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-muted/50"
                  >
                    <CalendarOff className="size-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm">
                      {formatDateShort(a.startDate)} —{" "}
                      {formatDateShort(a.endDate)}
                    </span>
                  </Link>
                ))}
          </>
        )}
      </CardContent>
      {absences != null && absences.length > 0 && (
        <CardFooter className="mt-auto">
          <Button variant="link" asChild className="px-0">
            <Link to="/me/days-off">{m.dashboard_view_all()}</Link>
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
