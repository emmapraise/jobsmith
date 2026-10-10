import { describe, expect, it } from "vitest";
import { locationFits, mentionsRelocation, mentionsVisa, rankListings, scoreListing } from "@/lib/search/rank";
import type { Listing } from "@/lib/search/sources";

const L = (o: Partial<Listing>): Listing => ({ id: "x:1", source: "Remotive", title: "Backend Engineer", company: "Acme", location: "Worldwide", remote: true, url: "https://example.com/1", description: "", tags: [], salary: "", postedAt: 0, ...o });

describe("job search ranking", () => {
  it("detects visa and relocation mentions, but not refusals", () => {
    expect(mentionsVisa("We offer visa sponsorship for the right candidate")).toBe(true);
    expect(mentionsVisa("Unfortunately we are unable to sponsor visas")).toBe(false);
    expect(mentionsVisa("No visa sponsorship available")).toBe(false);
    expect(mentionsRelocation("Relocation assistance provided")).toBe(true);
  });

  it("worldwide remote suits any country, regional remote only matching ones, onsite needs the country", () => {
    expect(locationFits(L({ location: "Worldwide" }), "Nigeria")).toBe(true);
    expect(locationFits(L({ location: "Europe" }), "United Kingdom")).toBe(true);
    expect(locationFits(L({ location: "USA Only" }), "United Kingdom")).toBe(false);
    expect(locationFits(L({ remote: false, location: "London, UK" }), "United Kingdom")).toBe(true);
    expect(locationFits(L({ remote: false, location: "Munich, Germany" }), "United Kingdom")).toBe(false);
  });

  it("scores by your skills (whole words) and a targeted title, and ranks best first", () => {
    const skills = ["Java", "Node.js", "PostgreSQL", "Go"];
    expect(scoreListing(L({ description: "We use JavaScript and go-to-market" }), skills, []).matched).toEqual([]); // Java ≠ JavaScript; "Go" skipped
    const good = L({ id: "a", description: "Node.js, PostgreSQL, Java services" });
    const none = L({ id: "b", title: "Chef", description: "Cook" });
    const r = rankListings([none, good, good], { q: "", country: "", remoteOnly: false, visa: false, relocation: false }, skills, ["Backend Engineer"]);
    expect(r.map((x) => x.id)).toEqual(["a"]); // duplicate removed, zero-fit hidden without a query
    expect(r[0].fit).toBe(Math.round((3 / 6) * 75 + 25));
  });
});
