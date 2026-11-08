// Workaround: GitHub returns `model_picker_enabled: false` for every model on
// Copilot Free/Student plans, and OpenCode maps that field to `enabled: false`,
// hiding all github-copilot models. Re-enable only the IDs verified working.
// Remove once https://github.com/anomalyco/opencode/pull/55960 ships.

const WORKING = new Set([
  "gpt-4.1",
  "gpt-4.1-2025-04-14",
  "gpt-4o",
  "gpt-4o-2024-11-20",
  "gpt-4o-2024-08-06",
  "gpt-4o-2024-05-13",
  "gpt-4-o-preview",
  "gpt-4o-mini",
  "gpt-4o-mini-2024-07-18",
  "gpt-3.5-turbo",
  "gpt-3.5-turbo-0613",
]);

export default {
  id: "copilot-free",
  async setup(ctx: any) {
    await ctx.model.transform((editor: any) => {
      for (const model of editor.list("github-copilot")) {
        if (!WORKING.has(model.id)) continue
        editor.update(model.providerID, model.id, (draft: any) => {
          draft.enabled = true
        })
      }
    })
  },
}
