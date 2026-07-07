export function getSessionSource(sessionID: string, ownedSessionIDs: string[], attachedSessionIDs: string[]) {
  const external = attachedSessionIDs.includes(sessionID) && !ownedSessionIDs.includes(sessionID)
  if (!external) return { external: false }
  return {
    external: true,
    label: "外部会话",
    description: "会同步 CLI 或其它客户端写入的消息；普通聊天/流式测试建议新建工作区会话。",
  }
}
