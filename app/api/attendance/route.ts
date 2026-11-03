import { DomainError } from "../../../src/lib/http";
import { loadAttendance, saveAttendance } from "../../../src/features/attendance/service";
import { parseAttendanceSave } from "../../../src/features/attendance/policy";
import { json, sameOrigin, sessionActor } from "../../../src/features/pastoral/http";
import { ReportError } from "../../../src/features/pastoral/policy";

function fail(error: unknown) {
  if (error instanceof ReportError || error instanceof DomainError) {
    return json({ code: error.code }, error.status);
  }
  throw error;
}

/** Sam leaders and village heads (and administrators) only; the service narrows it to their own sams. */
export async function GET(request: Request) {
  try {
    const actor = await sessionActor();
    const params = new URL(request.url).searchParams;
    return json(await loadAttendance(actor, params.get("samId"), params.get("date")));
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: Request) {
  try {
    const actor = await sessionActor();
    sameOrigin(request);
    const input = parseAttendanceSave(await request.json().catch(() => null));
    return json({ status: "ok", result: await saveAttendance(actor, input) });
  } catch (error) {
    return fail(error);
  }
}
