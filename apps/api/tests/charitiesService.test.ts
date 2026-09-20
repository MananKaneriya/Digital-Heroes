import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, storageFromMock } = vi.hoisted(() => ({ fromMock: vi.fn(), storageFromMock: vi.fn() }));
const recordAuditMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../src/lib/supabase.js", () => ({
  supabaseAdmin: { from: fromMock, storage: { from: storageFromMock } },
}));

vi.mock("../src/modules/audit/audit.service.js", () => ({
  recordAudit: recordAuditMock,
}));

import {
  recordContributionForPeriod,
  selectCharity,
  setFeaturedCharity,
  updateCharity,
  uploadCharityMedia,
} from "../src/modules/charities/charities.service.js";

function chainable(result: { data?: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "neq", "order", "update", "delete", "insert", "upsert", "limit", "gte", "in"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(() => Promise.resolve(result));
  builder.single = vi.fn(() => Promise.resolve(result));
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

beforeEach(() => {
  fromMock.mockReset();
  storageFromMock.mockReset();
  storageFromMock.mockReturnValue({ getPublicUrl: () => ({ data: { publicUrl: "https://example.test/logo.png" } }) });
  recordAuditMock.mockClear();
});

describe("selectCharity", () => {
  it("rejects a nonexistent charity", async () => {
    fromMock.mockReturnValueOnce(chainable({ data: null, error: null }));

    await expect(selectCharity("user-1", { charityId: "charity-x", contributionPercent: 10 }, "req-1")).rejects.toMatchObject({
      status: 400,
    });
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it("rejects an inactive charity", async () => {
    fromMock.mockReturnValueOnce(chainable({ data: { id: "charity-1", name: "Bright Path", is_active: false }, error: null }));

    await expect(selectCharity("user-1", { charityId: "charity-1", contributionPercent: 10 }, "req-1")).rejects.toMatchObject({
      status: 400,
    });
  });

  it("creates a new selection and audits it as created when none existed before", async () => {
    fromMock
      .mockReturnValueOnce(chainable({ data: { id: "charity-1", name: "Bright Path", is_active: true }, error: null }))
      .mockReturnValueOnce(chainable({ data: null, error: null })) // no prior selection
      .mockReturnValueOnce(chainable({ error: null })); // upsert

    const result = await selectCharity("user-1", { charityId: "charity-1", contributionPercent: 12 }, "req-1");

    expect(result.charityName).toBe("Bright Path");
    expect(recordAuditMock).toHaveBeenCalledWith(expect.objectContaining({ action: "charity.selection_created" }));
  });

  it("audits a change of an existing selection as updated, not created", async () => {
    fromMock
      .mockReturnValueOnce(chainable({ data: { id: "charity-2", name: "Ocean Renewal", is_active: true }, error: null }))
      .mockReturnValueOnce(chainable({ data: { charity_id: "charity-1", contribution_percent: 10 }, error: null }))
      .mockReturnValueOnce(chainable({ error: null }));

    await selectCharity("user-1", { charityId: "charity-2", contributionPercent: 20 }, "req-1");

    expect(recordAuditMock).toHaveBeenCalledWith(expect.objectContaining({ action: "charity.selection_updated" }));
  });
});

describe("recordContributionForPeriod", () => {
  it("does nothing when the subscriber has never selected a charity", async () => {
    fromMock.mockReturnValueOnce(chainable({ data: null, error: null }));

    await recordContributionForPeriod("user-1", 1200, new Date("2026-10-01"));

    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(recordAuditMock).not.toHaveBeenCalled();
  });

  it("calculates and records the contribution, snapshotting the amount and percentage", async () => {
    fromMock
      .mockReturnValueOnce(chainable({ data: { charity_id: "charity-1", contribution_percent: 15 }, error: null }))
      .mockReturnValueOnce(chainable({ error: null }));

    await recordContributionForPeriod("user-1", 1200, new Date("2026-10-01"), "req-1");

    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "charity.contribution_recorded",
        newState: expect.objectContaining({ contributionPercent: 15, subscriptionAmountCents: 1200, contributionCents: 180 }),
      }),
    );
  });

  it("silently no-ops when a contribution for this billing period was already recorded (idempotent)", async () => {
    fromMock
      .mockReturnValueOnce(chainable({ data: { charity_id: "charity-1", contribution_percent: 10 }, error: null }))
      .mockReturnValueOnce(chainable({ error: { code: "23505", message: "duplicate key" } }));

    await expect(recordContributionForPeriod("user-1", 1200, new Date("2026-10-01"))).resolves.toBeUndefined();
    expect(recordAuditMock).not.toHaveBeenCalled();
  });
});

describe("setFeaturedCharity", () => {
  it("unfeatures the previously featured charity before featuring the new one", async () => {
    fromMock
      .mockReturnValueOnce(chainable({ data: { id: "charity-old" }, error: null })) // currently featured lookup
      .mockReturnValueOnce(chainable({ error: null })) // unfeature charity-old
      .mockReturnValueOnce(chainable({ data: { id: "charity-new", is_active: true }, error: null })) // target lookup
      .mockReturnValueOnce(chainable({ error: null })); // feature charity-new

    await setFeaturedCharity("admin-1", "charity-new", "req-1");

    expect(recordAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "charity.featured_set",
        previousState: { previouslyFeaturedCharityId: "charity-old" },
        newState: { featuredCharityId: "charity-new" },
      }),
    );
  });

  it("rejects featuring an inactive charity", async () => {
    fromMock
      .mockReturnValueOnce(chainable({ data: null, error: null })) // nothing currently featured
      .mockReturnValueOnce(chainable({ data: { id: "charity-new", is_active: false }, error: null }));

    await expect(setFeaturedCharity("admin-1", "charity-new", "req-1")).rejects.toMatchObject({ status: 400 });
  });
});

describe("updateCharity", () => {
  it("records a deactivation as its own distinct audit action", async () => {
    fromMock
      .mockReturnValueOnce(chainable({ data: { id: "charity-1", name: "Bright Path", slug: "bright-path", is_active: true }, error: null }))
      .mockReturnValueOnce(
        chainable({ data: { id: "charity-1", name: "Bright Path", slug: "bright-path", is_active: false, short_description: "", full_description: "", logo_path: null, is_featured: false, created_at: "t", updated_at: "t" }, error: null }),
      );

    await updateCharity("admin-1", "charity-1", { isActive: false }, "req-1");

    expect(recordAuditMock).toHaveBeenCalledWith(expect.objectContaining({ action: "charity.deactivated" }));
  });
});

describe("uploadCharityMedia", () => {
  it("rejects a disallowed file type before ever touching storage", async () => {
    fromMock.mockReturnValueOnce(chainable({ data: { id: "charity-1" }, error: null }));

    await expect(
      uploadCharityMedia("admin-1", "charity-1", { buffer: Buffer.from("x"), mimetype: "application/pdf", size: 10, originalname: "x.pdf" }, undefined, "req-1"),
    ).rejects.toMatchObject({ status: 400 });
    expect(storageFromMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized file before ever touching storage", async () => {
    fromMock.mockReturnValueOnce(chainable({ data: { id: "charity-1" }, error: null }));

    await expect(
      uploadCharityMedia(
        "admin-1",
        "charity-1",
        { buffer: Buffer.alloc(10), mimetype: "image/png", size: 6 * 1024 * 1024, originalname: "big.png" },
        undefined,
        "req-1",
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(storageFromMock).not.toHaveBeenCalled();
  });
});
