import type { Edge, Node } from "reactflow";
import type { MemberNodeData } from "./member-node";

export function aggregateOverviewGraph(
  nodes: Node<MemberNodeData>[],
  edges: Edge[],
  chronological: boolean,
) {
  const groups = new Map<
    string,
    { representative: Node<MemberNodeData>; ids: string[]; x: number; y: number }
  >();
  const groupByNode = new Map<string, string>();
  for (const node of nodes) {
    const key = chronological
      ? `period:${node.position.y}`
      : `level:${node.position.y}:column:${Math.floor(node.position.x / 4_000)}`;
    const group = groups.get(key);
    if (group) {
      group.ids.push(node.id);
      group.x += node.position.x;
      group.y += node.position.y;
    } else {
      groups.set(key, {
        representative: node,
        ids: [node.id],
        x: node.position.x,
        y: node.position.y,
      });
    }
    groupByNode.set(node.id, key);
  }
  const aggregateIdByKey = new Map<string, string>();
  const aggregateNodes = [...groups].map(([key, group], index) => {
    const id = `aggregate:${index}`;
    aggregateIdByKey.set(key, id);
    return {
      ...group.representative,
      id,
      position: { x: group.x / group.ids.length, y: group.y / group.ids.length },
      data: {
        ...group.representative.data,
        aggregateCount: group.ids.length,
        editable: false,
        detail: "overview" as const,
      },
      draggable: false,
      connectable: false,
    };
  });
  const seen = new Set<string>();
  const aggregateEdges: Edge[] = [];
  for (const edge of edges) {
    const sourceKey = groupByNode.get(edge.source);
    const targetKey = groupByNode.get(edge.target);
    if (!sourceKey || !targetKey || sourceKey === targetKey) continue;
    const source = aggregateIdByKey.get(sourceKey)!;
    const target = aggregateIdByKey.get(targetKey)!;
    const key = `${source}:${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    aggregateEdges.push({
      ...edge,
      id: `aggregate-edge:${key}`,
      source,
      target,
      data: { kind: "aggregate" },
      markerEnd: undefined,
      focusable: false,
    });
  }
  return { nodes: aggregateNodes, edges: aggregateEdges };
}
