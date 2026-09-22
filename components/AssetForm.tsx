"use client";

import { useState } from "react";
import { createAssetAction } from "@/app/actions";

const CATEGORIES = ["fund", "equity", "bond", "commodity", "crypto", "private"];

export function AssetForm() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} className="btn-outline">
        {open ? "Close" : "+ Add asset"}
      </button>

      {open ? (
        <form action={createAssetAction} className="mt-4 space-y-3 rounded-lg border border-line bg-surface2 p-4">
          <div>
            <label htmlFor="asset-name" className="label">
              Asset name
            </label>
            <input
              id="asset-name"
              name="name"
              type="text"
              required
              className="input"
              placeholder="e.g. BlackRock US Treasury Index Fund"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="asset-ticker" className="label">
                Ticker (optional)
              </label>
              <input id="asset-ticker" name="ticker" type="text" className="input" placeholder="GGAL" />
            </div>
            <div>
              <label htmlFor="asset-category" className="label">
                Category
              </label>
              <select id="asset-category" name="category" className="input" defaultValue="fund">
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="asset-isin" className="label">
                ISIN (optional)
              </label>
              <input id="asset-isin" name="isin" type="text" className="input" placeholder="US0000000000" />
            </div>
          </div>
          <div>
            <label htmlFor="asset-description" className="label">
              Description (optional)
            </label>
            <textarea
              id="asset-description"
              name="description"
              className="input min-h-16"
              placeholder="Underlying exposure, fund vehicle, custodian, etc."
            />
          </div>
          <button type="submit" className="btn-primary">
            Create asset
          </button>
        </form>
      ) : null}
    </div>
  );
}