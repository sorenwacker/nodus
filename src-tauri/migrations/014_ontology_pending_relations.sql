-- Ontology relations whose end is not in the workspace yet. A later import
-- that brings the end in turns them into edges
-- (PRODUCT_DESIGN.md > Ontologies split across files)
CREATE TABLE IF NOT EXISTS ontology_pending_relations (
    -- '' for the default workspace, so the key has no NULL in it
    workspace_key TEXT NOT NULL,
    source_iri TEXT NOT NULL,
    target_iri TEXT NOT NULL,
    link_type TEXT NOT NULL,
    color TEXT,
    PRIMARY KEY (workspace_key, source_iri, target_iri, link_type)
);
