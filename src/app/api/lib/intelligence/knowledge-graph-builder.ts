/* eslint-disable @typescript-eslint/no-explicit-any */
// app/lib/intelligence/knowledge-graph-builder.ts

interface GraphNode {
  id: string;
  type: string;
  label: string;
  properties: Record<string, any>;
  embeddings?: number[];
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relationship: string;
  weight: number;
  properties?: Record<string, any>;
}

interface KnowledgeGraph {
  nodes: Map<string, GraphNode>;
  edges: Map<string, GraphEdge>;
  clusters: Map<string, string[]>;
}

interface EntityRelationship {
  entity1: string;
  entity2: string;
  relationship: string;
  confidence: number;
  context?: string;
}

export class KnowledgeGraphBuilder {
  private graph: KnowledgeGraph;
  private relationshipPatterns!: Map<string, RegExp[]>;
  private domainOntologies!: Map<string, any>;
  
  constructor() {
    this.graph = {
      nodes: new Map(),
      edges: new Map(),
      clusters: new Map()
    };
    this.initializePatterns();
    this.initializeOntologies();
  }

  private initializePatterns() {
    this.relationshipPatterns = new Map([
      ['isPartOf', [
        /\b(\w+)\s+(?:is|are)\s+(?:a\s+)?part\s+of\s+(\w+)/gi,
        /\b(\w+)\s+(?:belongs?|belong)\s+to\s+(\w+)/gi,
        /\b(\w+)\s+(?:component|element|member)\s+of\s+(\w+)/gi
      ]],
      ['hasProperty', [
        /\b(\w+)\s+(?:has|have)\s+(\w+)/gi,
        /\b(\w+)\s+(?:contains?|include)\s+(\w+)/gi,
        /\b(\w+)\s+with\s+(\w+)/gi
      ]],
      ['relatedTo', [
        /\b(\w+)\s+(?:related|similar)\s+to\s+(\w+)/gi,
        /\b(\w+)\s+and\s+(\w+)\s+are\s+(?:related|similar)/gi,
        /\b(\w+)\s+(?:like|such\s+as)\s+(\w+)/gi
      ]],
      ['causedBy', [
        /\b(\w+)\s+(?:caused?|due)\s+(?:by|to)\s+(\w+)/gi,
        /\b(\w+)\s+(?:results?|resulting)\s+(?:from|in)\s+(\w+)/gi,
        /\b(\w+)\s+(?:leads?|leading)\s+to\s+(\w+)/gi
      ]],
      ['usedFor', [
        /\b(\w+)\s+(?:used?|using)\s+(?:for|to)\s+(\w+)/gi,
        /\b(\w+)\s+(?:helps?|helping)\s+(?:with|to)\s+(\w+)/gi,
        /\b(\w+)\s+for\s+(\w+)/gi
      ]],
      ['locatedIn', [
        /\b(\w+)\s+(?:located?|found)\s+(?:in|at)\s+(\w+)/gi,
        /\b(\w+)\s+in\s+(\w+)/gi,
        /\b(\w+)\s+at\s+(\w+)/gi
      ]],
      ['produces', [
        /\b(\w+)\s+(?:produces?|producing|creates?|creating)\s+(\w+)/gi,
        /\b(\w+)\s+(?:generates?|generating|makes?|making)\s+(\w+)/gi
      ]],
      ['requires', [
        /\b(\w+)\s+(?:requires?|requiring|needs?|needing)\s+(\w+)/gi,
        /\b(\w+)\s+(?:depends?|depending)\s+on\s+(\w+)/gi
      ]]
    ]);
  }

  private initializeOntologies() {
    // Domain-specific ontologies for better relationship understanding
    this.domainOntologies = new Map([
      ['technology', {
        entities: ['software', 'hardware', 'API', 'database', 'server', 'application'],
        relationships: ['integrates', 'implements', 'extends', 'uses', 'connects'],
        hierarchy: {
          'software': ['application', 'API', 'database'],
          'hardware': ['server', 'device', 'component']
        }
      }],
      ['business', {
        entities: ['company', 'product', 'service', 'customer', 'market', 'revenue'],
        relationships: ['provides', 'serves', 'competes', 'partners', 'acquires'],
        hierarchy: {
          'company': ['department', 'team', 'employee'],
          'market': ['segment', 'demographic', 'region']
        }
      }],
      ['medical', {
        entities: ['disease', 'symptom', 'treatment', 'medication', 'patient', 'condition'],
        relationships: ['treats', 'causes', 'prevents', 'diagnoses', 'affects'],
        hierarchy: {
          'disease': ['symptom', 'complication'],
          'treatment': ['medication', 'therapy', 'procedure']
        }
      }],
      ['education', {
        entities: ['course', 'student', 'teacher', 'curriculum', 'skill', 'knowledge'],
        relationships: ['teaches', 'learns', 'requires', 'develops', 'assesses'],
        hierarchy: {
          'curriculum': ['course', 'module', 'lesson'],
          'skill': ['competency', 'ability', 'expertise']
        }
      }]
    ]);
  }

  async buildGraph(
    entities: any[],
    content: string,
    domain?: string
  ): Promise<KnowledgeGraph> {
    // Clear existing graph
    this.graph = {
      nodes: new Map(),
      edges: new Map(),
      clusters: new Map()
    };

    // Add entities as nodes
    for (const entity of entities) {
      this.addNode(entity);
    }

    // Extract relationships from content
    const relationships = await this.extractRelationships(content, entities);
    
    // Add relationships as edges
    for (const rel of relationships) {
      this.addEdge(rel);
    }

    // Apply domain knowledge if specified
    if (domain && this.domainOntologies.has(domain)) {
      this.applyDomainKnowledge(domain);
    }

    // Cluster related nodes
    this.clusterNodes();

    // Calculate node importance
    this.calculateNodeImportance();

    return this.graph;
  }

  private addNode(entity: any) {
    const nodeId = this.generateNodeId(entity.name);
    
    const node: GraphNode = {
      id: nodeId,
      type: entity.type || 'Thing',
      label: entity.name,
      properties: {
        confidence: entity.confidence || 1.0,
        category: entity.category,
        context: entity.context,
        mentions: 1,
        importance: 0
      }
    };

    if (this.graph.nodes.has(nodeId)) {
      // Update existing node
      const existing = this.graph.nodes.get(nodeId)!;
      existing.properties.mentions++;
      existing.properties.confidence = Math.max(
        existing.properties.confidence,
        entity.confidence || 1.0
      );
    } else {
      this.graph.nodes.set(nodeId, node);
    }
  }

  private async extractRelationships(
    content: string,
    entities: any[]
  ): Promise<EntityRelationship[]> {
    const relationships: EntityRelationship[] = [];
    const entityNames = entities.map(e => e.name);
    
    // Pattern-based extraction
    for (const [relType, patterns] of this.relationshipPatterns) {
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const entity1 = this.findMatchingEntity(match[1], entityNames);
          const entity2 = this.findMatchingEntity(match[2], entityNames);
          
          if (entity1 && entity2 && entity1 !== entity2) {
            relationships.push({
              entity1,
              entity2,
              relationship: relType,
              confidence: 0.7,
              context: match[0]
            });
          }
        }
      }
    }

    // Co-occurrence based relationships
    const coOccurrences = this.findCoOccurrences(content, entityNames);
    for (const coOcc of coOccurrences) {
      relationships.push({
        entity1: coOcc.entity1,
        entity2: coOcc.entity2,
        relationship: 'relatedTo',
        confidence: coOcc.strength,
        context: 'co-occurrence'
      });
    }

    // Hierarchical relationships based on entity types
    this.inferHierarchicalRelationships(entities, relationships);

    return relationships;
  }

  private findMatchingEntity(text: string, entityNames: string[]): string | null {
    const normalized = text.toLowerCase().trim();
    
    // Exact match
    for (const name of entityNames) {
      if (name.toLowerCase() === normalized) {
        return name;
      }
    }
    
    // Partial match
    for (const name of entityNames) {
      if (name.toLowerCase().includes(normalized) || 
          normalized.includes(name.toLowerCase())) {
        return name;
      }
    }
    
    return null;
  }

  private findCoOccurrences(
    content: string,
    entityNames: string[]
  ): { entity1: string; entity2: string; strength: number }[] {
    const coOccurrences: { entity1: string; entity2: string; strength: number }[] = [];
    const sentences = content.split(/[.!?]+/);
    
    for (const sentence of sentences) {
      const sentenceLower = sentence.toLowerCase();
      const foundEntities: string[] = [];
      
      for (const entity of entityNames) {
        if (sentenceLower.includes(entity.toLowerCase())) {
          foundEntities.push(entity);
        }
      }
      
      // Create relationships between entities in the same sentence
      for (let i = 0; i < foundEntities.length; i++) {
        for (let j = i + 1; j < foundEntities.length; j++) {
          const existing = coOccurrences.find(
            co => (co.entity1 === foundEntities[i] && co.entity2 === foundEntities[j]) ||
                  (co.entity1 === foundEntities[j] && co.entity2 === foundEntities[i])
          );
          
          if (existing) {
            existing.strength = Math.min(existing.strength + 0.1, 1.0);
          } else {
            coOccurrences.push({
              entity1: foundEntities[i],
              entity2: foundEntities[j],
              strength: 0.5
            });
          }
        }
      }
    }
    
    return coOccurrences.filter(co => co.strength > 0.4);
  }

  private inferHierarchicalRelationships(
    entities: any[],
    relationships: EntityRelationship[]
  ) {
    // Infer relationships based on entity types
    const typeHierarchy: Record<string, string[]> = {
      'organization': ['department', 'team', 'group'],
      'product': ['feature', 'component', 'variant'],
      'concept': ['subconcept', 'aspect', 'element'],
      'location': ['sublocation', 'area', 'region']
    };
    
    for (const parent of entities) {
      const childTypes = typeHierarchy[parent.type];
      if (childTypes) {
        for (const child of entities) {
          if (childTypes.includes(child.type) && parent.name !== child.name) {
            // Check if relationship doesn't already exist
            const exists = relationships.some(
              r => r.entity1 === parent.name && r.entity2 === child.name
            );
            
            if (!exists) {
              relationships.push({
                entity1: parent.name,
                entity2: child.name,
                relationship: 'contains',
                confidence: 0.6
              });
            }
          }
        }
      }
    }
  }

  private addEdge(relationship: EntityRelationship) {
    const sourceId = this.generateNodeId(relationship.entity1);
    const targetId = this.generateNodeId(relationship.entity2);
    const edgeId = `${sourceId}-${relationship.relationship}-${targetId}`;
    
    // Ensure both nodes exist
    if (!this.graph.nodes.has(sourceId) || !this.graph.nodes.has(targetId)) {
      return;
    }
    
    const edge: GraphEdge = {
      id: edgeId,
      source: sourceId,
      target: targetId,
      relationship: relationship.relationship,
      weight: relationship.confidence,
      properties: {
        context: relationship.context
      }
    };
    
    if (this.graph.edges.has(edgeId)) {
      // Update existing edge weight
      const existing = this.graph.edges.get(edgeId)!;
      existing.weight = Math.min(existing.weight + 0.1, 1.0);
    } else {
      this.graph.edges.set(edgeId, edge);
    }
  }

  private applyDomainKnowledge(domain: string) {
    const ontology = this.domainOntologies.get(domain);
    if (!ontology) return;
    
    // Add domain-specific relationships
    for (const [parentType, childTypes] of Object.entries(ontology.hierarchy)) {
      const parentNodes = Array.from(this.graph.nodes.values())
        .filter(node => node.type === parentType);
      
      for (const parentNode of parentNodes) {
        const childNodes = Array.from(this.graph.nodes.values())
          .filter(node => (childTypes as string[]).includes(node.type));
        
        for (const childNode of childNodes) {
          // Add hierarchical relationship
          const edgeId = `${parentNode.id}-hierarchical-${childNode.id}`;
          if (!this.graph.edges.has(edgeId)) {
            this.graph.edges.set(edgeId, {
              id: edgeId,
              source: parentNode.id,
              target: childNode.id,
              relationship: 'hierarchical',
              weight: 0.8
            });
          }
        }
      }
    }
  }

  private clusterNodes() {
    // Simple clustering based on connectivity
    const visited = new Set<string>();
    let clusterId = 0;
    
    for (const node of this.graph.nodes.values()) {
      if (!visited.has(node.id)) {
        const cluster = this.dfs(node.id, visited);
        if (cluster.length > 1) {
          this.graph.clusters.set(`cluster-${clusterId}`, cluster);
          clusterId++;
        }
      }
    }
  }

  private dfs(nodeId: string, visited: Set<string>): string[] {
    visited.add(nodeId);
    const cluster = [nodeId];
    
    // Find all connected nodes
    for (const edge of this.graph.edges.values()) {
      if (edge.source === nodeId && !visited.has(edge.target)) {
        cluster.push(...this.dfs(edge.target, visited));
      } else if (edge.target === nodeId && !visited.has(edge.source)) {
        cluster.push(...this.dfs(edge.source, visited));
      }
    }
    
    return cluster;
  }

  private calculateNodeImportance() {
    // PageRank-like algorithm for node importance
    const damping = 0.85;
    const iterations = 50;
    const nodeCount = this.graph.nodes.size;
    
    // Initialize importance scores
    for (const node of this.graph.nodes.values()) {
      node.properties.importance = 1.0 / nodeCount;
    }
    
    // Iterative calculation
    for (let i = 0; i < iterations; i++) {
      const newScores = new Map<string, number>();
      
      for (const node of this.graph.nodes.values()) {
        let score = (1 - damping) / nodeCount;
        
        // Sum contributions from incoming edges
        for (const edge of this.graph.edges.values()) {
          if (edge.target === node.id) {
            const sourceNode = this.graph.nodes.get(edge.source);
            if (sourceNode) {
              const outDegree = this.getOutDegree(edge.source);
              score += damping * (sourceNode.properties.importance / outDegree) * edge.weight;
            }
          }
        }
        
        newScores.set(node.id, score);
      }
      
      // Update scores
      for (const [nodeId, score] of newScores) {
        const node = this.graph.nodes.get(nodeId);
        if (node) {
          node.properties.importance = score;
        }
      }
    }
  }

  private getOutDegree(nodeId: string): number {
    let count = 0;
    for (const edge of this.graph.edges.values()) {
      if (edge.source === nodeId) {
        count++;
      }
    }
    return Math.max(count, 1);
  }

  private generateNodeId(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '-');
  }

  // Public methods for querying the graph
  
  getNode(name: string): GraphNode | undefined {
    const nodeId = this.generateNodeId(name);
    return this.graph.nodes.get(nodeId);
  }

  getRelatedNodes(name: string, maxDepth: number = 2): GraphNode[] {
    const nodeId = this.generateNodeId(name);
    const related = new Set<string>();
    const queue: { id: string; depth: number }[] = [{ id: nodeId, depth: 0 }];
    const visited = new Set<string>();
    
    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (visited.has(id) || depth > maxDepth) continue;
      
      visited.add(id);
      if (id !== nodeId) {
        related.add(id);
      }
      
      // Add connected nodes to queue
      for (const edge of this.graph.edges.values()) {
        if (edge.source === id && !visited.has(edge.target)) {
          queue.push({ id: edge.target, depth: depth + 1 });
        } else if (edge.target === id && !visited.has(edge.source)) {
          queue.push({ id: edge.source, depth: depth + 1 });
        }
      }
    }
    
    return Array.from(related)
      .map(id => this.graph.nodes.get(id))
      .filter(node => node !== undefined) as GraphNode[];
  }

  getShortestPath(source: string, target: string): GraphNode[] | null {
    const sourceId = this.generateNodeId(source);
    const targetId = this.generateNodeId(target);
    
    if (!this.graph.nodes.has(sourceId) || !this.graph.nodes.has(targetId)) {
      return null;
    }
    
    // Dijkstra's algorithm
    const distances = new Map<string, number>();
    const previous = new Map<string, string | null>();
    const unvisited = new Set<string>();
    
    for (const nodeId of this.graph.nodes.keys()) {
      distances.set(nodeId, Infinity);
      previous.set(nodeId, null);
      unvisited.add(nodeId);
    }
    
    distances.set(sourceId, 0);
    
    while (unvisited.size > 0) {
      // Find unvisited node with minimum distance
      let current: string | null = null;
      let minDistance = Infinity;
      
      for (const nodeId of unvisited) {
        const distance = distances.get(nodeId)!;
        if (distance < minDistance) {
          current = nodeId;
          minDistance = distance;
        }
      }
      
      if (current === null || current === targetId) break;
      
      unvisited.delete(current);
      
      // Update distances to neighbors
      for (const edge of this.graph.edges.values()) {
        let neighbor: string | null = null;
        
        if (edge.source === current) {
          neighbor = edge.target;
        } else if (edge.target === current) {
          neighbor = edge.source;
        }
        
        if (neighbor && unvisited.has(neighbor)) {
          const alt = distances.get(current)! + (1 / edge.weight);
          if (alt < distances.get(neighbor)!) {
            distances.set(neighbor, alt);
            previous.set(neighbor, current);
          }
        }
      }
    }
    
    // Reconstruct path
    const path: string[] = [];
    let current: string | null = targetId;
    
    while (current !== null) {
      path.unshift(current);
      current = previous.get(current) || null;
    }
    
    if (path[0] !== sourceId) {
      return null; // No path exists
    }
    
    return path
      .map(id => this.graph.nodes.get(id))
      .filter(node => node !== undefined) as GraphNode[];
  }

  getMostImportantNodes(limit: number = 10): GraphNode[] {
    return Array.from(this.graph.nodes.values())
      .sort((a, b) => b.properties.importance - a.properties.importance)
      .slice(0, limit);
  }

  exportToSchema(): any {
    const schema: any = {
      "@context": "https://schema.org",
      "@graph": []
    };
    
    // Export nodes as Things
    for (const node of this.graph.nodes.values()) {
      const nodeSchema: any = {
        "@type": this.mapNodeTypeToSchema(node.type),
        "@id": `#${node.id}`,
        "name": node.label
      };
      
      // Add relationships
      const relationships: any[] = [];
      for (const edge of this.graph.edges.values()) {
        if (edge.source === node.id) {
          const targetNode = this.graph.nodes.get(edge.target);
          if (targetNode) {
            relationships.push({
              "@type": "Relationship",
              "relationshipType": edge.relationship,
              "object": {
                "@id": `#${edge.target}`,
                "name": targetNode.label
              }
            });
          }
        }
      }
      
      if (relationships.length > 0) {
        nodeSchema.potentialAction = relationships;
      }
      
      schema["@graph"].push(nodeSchema);
    }
    
    return schema;
  }

  private mapNodeTypeToSchema(nodeType: string): string {
    const typeMap: Record<string, string> = {
      'person': 'Person',
      'organization': 'Organization',
      'product': 'Product',
      'service': 'Service',
      'location': 'Place',
      'event': 'Event',
      'concept': 'Thing',
      'medical': 'MedicalEntity',
      'fitness': 'ExercisePlan'
    };
    
    return typeMap[nodeType] || 'Thing';
  }
}

// Export singleton instance
export const knowledgeGraphBuilder = new KnowledgeGraphBuilder();