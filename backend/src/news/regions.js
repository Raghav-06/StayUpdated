// Where to look for news. Each provider reads only the setting it understands;
// a missing value (e.g. for "global") means "don't restrict".
export const REGIONS = {
  IN: { googleNews: "hl=en-IN&gl=IN&ceid=IN:en", bing: { setmkt: "en-IN", cc: "IN" }, ddg: "in-en", gdelt: "IN", youtube: "IN", serper: "in" },
  US: { googleNews: "hl=en-US&gl=US&ceid=US:en", bing: { setmkt: "en-US", cc: "US" }, ddg: "us-en", gdelt: "US", youtube: "US", serper: "us" },
  GB: { googleNews: "hl=en-GB&gl=GB&ceid=GB:en", bing: { setmkt: "en-GB", cc: "GB" }, ddg: "uk-en", gdelt: "UK", youtube: "GB", serper: "gb" },
  global: { googleNews: "hl=en-US&gl=US&ceid=US:en", bing: null, ddg: "wt-wt", gdelt: null, youtube: null, serper: null },
};

export const DEFAULT_REGION = "IN";

export function isRegion(value) {
  return typeof value === "string" && Object.hasOwn(REGIONS, value);
}

export function regionSettings(region) {
  return REGIONS[isRegion(region) ? region : DEFAULT_REGION];
}
