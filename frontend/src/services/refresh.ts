/** 全局刷新触发器 — 审核/上传后通知 Dashboard 重新拉数据 */
type Listener = () => void
const listeners: Set<Listener> = new Set()

export const refreshDashboard = {
  subscribe(fn: Listener): () => void {
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  },
  trigger() {
    listeners.forEach((fn) => fn())
  },
}
