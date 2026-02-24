# Agents instructions for package/ui

- For Radix/shadcn Tooltip triggers, avoid `asChild` with custom wrapper buttons unless they are fully ref/prop-forwarding-safe; prefer styling `TooltipTrigger` directly.This prevents tooltips from silently staying closed on hover/focus when Radix cannot compose trigger refs/handlers through the child component.Button with asChild often fails as a tooltip trigger because Radix needs to attach refs and event handlers to a concrete DOM element, and that composition can break through wrapper/slot layers.
