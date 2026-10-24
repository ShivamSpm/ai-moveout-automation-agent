import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ getUser: vi.fn(), signUp: vi.fn(), signInWithPassword: vi.fn() }));
const save = vi.hoisted(() => vi.fn());
vi.mock("@/server/supabase", () => ({ userClient: async () => ({ auth }) }));
vi.mock("@/server/auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/server/marketplace", () => ({ updateMove: save }));
vi.mock("@/server/env", () => ({ env: { appUrl: () => "http://localhost:3101" } }));
import { saveStart } from "@/app/start/actions";
function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({ email: "renter@example.test", password: "secret-test-password", address: "100 Example Street", moveOutDate: "2026-11-30", deposit: "3950", landlordName: "Example Manager", landlordPhone: "(415) 555-0134", landlordEmail: "renter@example.test" })) data.set(key, value);
  return data;
}
beforeEach(() => { vi.resetAllMocks(); auth.getUser.mockResolvedValue({ data: { user: null } }); });
describe("start action confirmation and error states", () => {
  it("returns confirmation without saving or exposing credentials when signup has no session", async () => {
    auth.signUp.mockResolvedValue({ data: { user: { identities: [{ id: "test" }] }, session: null }, error: null });
    expect(await saveStart({ status: "idle" }, form())).toEqual({ status: "confirm_email", email: "renter@example.test" });
    expect(auth.signUp.mock.calls[0][0].options.emailRedirectTo).toBe("http://localhost:3101/auth/callback?next=%2Fstart%3Fresume%3D1");
    expect(save).not.toHaveBeenCalled();
  });
  it("recognizes obfuscated existing accounts", async () => {
    auth.signUp.mockResolvedValue({ data: { user: { identities: [] }, session: null }, error: null });
    expect((await saveStart({ status: "idle" }, form())).status).toBe("existing_account");
    expect(save).not.toHaveBeenCalled();
  });
  it("does not echo provider errors or passwords", async () => {
    auth.signUp.mockRejectedValue(new Error("secret-test-password"));
    const state = await saveStart({ status: "idle" }, form());
    expect(state.status).toBe("error");
    expect(JSON.stringify(state)).not.toContain("secret-test-password");
    expect(save).not.toHaveBeenCalled();
  });
  it("saves the landlord phone with the move for a signed-in renter", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "renter" } } });
    const { requireUser } = await import("@/server/auth");
    vi.mocked(requireUser).mockResolvedValue({} as never);
    expect(await saveStart({ status: "idle" }, form())).toEqual({ status: "success" });
    expect(save.mock.calls[0][1]).toMatchObject({ landlordPhone: "(415) 555-0134", landlordName: "Example Manager" });
  });
  it("rejects a landlord phone that can't be dialed", async () => {
    const data = form(); data.set("landlordPhone", "call me");
    const state = await saveStart({ status: "idle" }, data);
    expect(state.fieldErrors?.landlordPhone).toBeDefined();
    expect(save).not.toHaveBeenCalled();
  });
  it("validates before attempting signup", async () => {
    const data = form(); data.set("deposit", "abc");
    const state = await saveStart({ status: "idle" }, data);
    expect(state.fieldErrors?.deposit).toBeDefined();
    expect(auth.signUp).not.toHaveBeenCalled();
  });
});
