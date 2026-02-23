import type { HTMLAttributes, MouseEvent as ReactMouseEvent } from "react"
import "./resize-handle.css"

type ResizeHandleProps = Omit<HTMLAttributes<HTMLDivElement>, "onResize"> & {
  direction: "horizontal" | "vertical"
  edge?: "start" | "end"
  size: number
  min: number
  max: number
  onResize: (size: number) => void
  onCollapse?: () => void
  collapseThreshold?: number
}

export function ResizeHandle(props: ResizeHandleProps) {
  function onMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault()

    const edge = props.edge ?? (props.direction === "vertical" ? "start" : "end")
    const start = props.direction === "horizontal" ? event.clientX : event.clientY
    const startSize = props.size
    let current = startSize

    document.body.style.userSelect = "none"
    document.body.style.overflow = "hidden"

    const onMouseMove = (moveEvent: MouseEvent) => {
      const position = props.direction === "horizontal" ? moveEvent.clientX : moveEvent.clientY
      const delta =
        props.direction === "vertical"
          ? edge === "end"
            ? position - start
            : start - position
          : edge === "start"
            ? start - position
            : position - start

      current = startSize + delta
      const clamped = Math.min(props.max, Math.max(props.min, current))
      props.onResize(clamped)
    }

    const onMouseUp = () => {
      document.body.style.userSelect = ""
      document.body.style.overflow = ""
      document.removeEventListener("mousemove", onMouseMove)
      document.removeEventListener("mouseup", onMouseUp)

      const threshold = props.collapseThreshold ?? 0
      if (props.onCollapse && threshold > 0 && current < threshold) {
        props.onCollapse()
      }
    }

    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp)
  }

  const edge = props.edge ?? (props.direction === "vertical" ? "start" : "end")
  const className = props.className ? `buddy-resize-handle ${props.className}` : "buddy-resize-handle"

  return (
    <div
      {...props}
      data-component="resize-handle"
      data-direction={props.direction}
      data-edge={edge}
      className={className}
      onMouseDown={onMouseDown}
    />
  )
}
