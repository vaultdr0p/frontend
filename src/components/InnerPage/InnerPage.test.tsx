import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InnerPage } from "@/components/InnerPage";

import { useVaultFeature } from "@/apiQueries/useVaultFeature";

import { useRedux } from "@/hooks/useRedux";

import type { UserRole } from "@/types";

vi.mock("@/apiQueries/useVaultFeature", () => ({ useVaultFeature: vi.fn() }));
vi.mock("@/hooks/useRedux", () => ({ useRedux: vi.fn() }));
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }));
// Neither is under test here, and both pull in store-connected children.
vi.mock("@/components/PageHeader", () => ({ PageHeader: () => null }));
vi.mock("@/components/ActiveWalletBar", () => ({ ActiveWalletBar: () => null }));

const setUser = (role: UserRole | null, isAuthenticated = true) =>
  vi.mocked(useRedux).mockReturnValue({
    userAccount: { role, isAuthenticated },
    organization: { data: { reporting_enabled: false, name: "org", logo: "" } },
    profile: { data: { email: "user@example.com" } },
  } as unknown as ReturnType<typeof useRedux>);

const renderPage = () =>
  render(
    <MemoryRouter>
      <InnerPage>
        <p>content</p>
      </InnerPage>
    </MemoryRouter>,
  );

const vaultLink = () => screen.queryByRole("link", { name: "Vault" });

describe("InnerPage sidebar: Vault item", () => {
  beforeEach(() => {
    vi.mocked(useVaultFeature).mockReset();
  });

  it("is shown, linking to /vault, when the feature is enabled and the role may open it", () => {
    setUser("owner");
    vi.mocked(useVaultFeature).mockReturnValue(true);
    renderPage();
    expect(vaultLink()).toHaveAttribute("href", "/vault");
  });

  it("is hidden when the feature is disabled or not yet confirmed", () => {
    setUser("owner");
    vi.mocked(useVaultFeature).mockReturnValue(false);
    renderPage();
    expect(vaultLink()).not.toBeInTheDocument();
    // The rest of the sidebar is unaffected.
    expect(screen.getByRole("link", { name: "Disbursements" })).toBeInTheDocument();
  });

  it.each(["owner", "financial_controller", "business", "initiator", "approver"] as UserRole[])(
    "probes for role %s, which the /vault route accepts",
    (role) => {
      setUser(role);
      vi.mocked(useVaultFeature).mockReturnValue(true);
      renderPage();
      expect(vi.mocked(useVaultFeature)).toHaveBeenCalledWith(expect.any(String), true);
      expect(vaultLink()).toBeInTheDocument();
    },
  );

  it("is hidden, and does not probe, for a role the /vault route rejects", () => {
    setUser("developer");
    // Even if the probe said yes, the role filter must hide it.
    vi.mocked(useVaultFeature).mockReturnValue(true);
    renderPage();
    expect(vi.mocked(useVaultFeature)).toHaveBeenCalledWith(expect.any(String), false);
    expect(vaultLink()).not.toBeInTheDocument();
  });

  it("does not probe when signed out", () => {
    setUser(null, false);
    vi.mocked(useVaultFeature).mockReturnValue(false);
    renderPage();
    expect(vi.mocked(useVaultFeature)).toHaveBeenCalledWith(expect.any(String), false);
  });
});
