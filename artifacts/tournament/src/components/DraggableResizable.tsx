import { useRef, useState, useEffect, type ReactNode, type CSSProperties } from "react";

interface Props {
  children: ReactNode;
  storageKey: string; // مفتاح لحفظ الموضع والحجم في المتصفح
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * صندوق قابل للسحب (تحريك) وقابل لتغيير الحجم من الزاوية السفلية اليمنى.
 * - اسحب من منطقة الرأس (أيقونة ⠿) لتحريك البطاقة.
 * - اسحب من المقبض في الزاوية لتغيير الحجم.
 * - الموضع والحجم يُحفظان تلقائياً في localStorage حسب storageKey.
 */
export default function DraggableResizable({
  children,
  storageKey,
  defaultWidth = 460,
  defaultHeight = 260,
  minWidth = 260,
  minHeight = 160,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startY: number; boxX: number; boxY: number } | null>(null);
  const resizeState = useRef<{ startX: number; startY: number; boxW: number; boxH: number } | null>(null);

  const [box, setBox] = useState<Box>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved) as Box;
    } catch {
      // تجاهل أي خطأ في القراءة
    }
    return { x: 0, y: 0, width: defaultWidth, height: defaultHeight };
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(box));
    } catch {
      // تجاهل أي خطأ في الحفظ
    }
  }, [box, storageKey]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (dragState.current) {
        const dx = e.clientX - dragState.current.startX;
        const dy = e.clientY - dragState.current.startY;
        setBox((b) => ({ ...b, x: dragState.current!.boxX + dx, y: dragState.current!.boxY + dy }));
      } else if (resizeState.current) {
        const dx = e.clientX - resizeState.current.startX;
        const dy = e.clientY - resizeState.current.startY;
        setBox((b) => ({
          ...b,
          width: Math.max(minWidth, resizeState.current!.boxW + dx),
          height: Math.max(minHeight, resizeState.current!.boxH + dy),
        }));
      }
    }
    function onMouseUp() {
      dragState.current = null;
      resizeState.current = null;
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [minWidth, minHeight]);

  function startDrag(e: React.MouseEvent) {
    e.preventDefault();
    dragState.current = { startX: e.clientX, startY: e.clientY, boxX: box.x, boxY: box.y };
  }

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    resizeState.current = { startX: e.clientX, startY: e.clientY, boxW: box.width, boxH: box.height };
  }

  const style: CSSProperties = {
    position: "relative",
    transform: `translate(${box.x}px, ${box.y}px)`,
    width: box.width,
    height: box.height,
  };

  return (
    <div ref={containerRef} style={style}>
      {/* مقبض السحب */}
      <div
        onMouseDown={startDrag}
        title="اسحب لتحريك البطاقة"
        style={{
          position: "absolute",
          top: 8,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 5,
          cursor: "grab",
          background: "rgba(0,0,0,0.55)",
          border: "1px solid rgba(255,255,255,0.25)",
          borderRadius: 8,
          padding: "2px 10px",
          fontSize: "0.9rem",
          color: "rgba(255,255,255,0.85)",
          userSelect: "none",
        }}
      >
        ⠿
      </div>

      <div style={{ width: "100%", height: "100%", overflow: "auto" }}>{children}</div>

      {/* مقبض تغيير الحجم */}
      <div
        onMouseDown={startResize}
        title="اسحب لتغيير الحجم"
        style={{
          position: "absolute",
          bottom: 4,
          right: 4,
          width: 18,
          height: 18,
          cursor: "nwse-resize",
          zIndex: 5,
          borderRight: "3px solid rgba(255,255,255,0.55)",
          borderBottom: "3px solid rgba(255,255,255,0.55)",
          borderRadius: "0 0 4px 0",
        }}
      />
    </div>
  );
}
