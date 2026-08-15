// Haskell queries for tree-sitter
export default `
; Top-level equations (function/value definitions)
(bind
  name: (variable) @name) @name.definition.function

; Standalone type signatures
(signature
  name: (variable) @name) @name.definition.signature

; Type declarations — "name:" field confirmed for data_type via direct
; query test; the same field is assumed for the other declaration kinds
; below pending the batch verification above.
(data_type
  name: (_) @name) @name.definition.type

(newtype
  name: (_) @name) @name.definition.type

(type_synomym
  name: (_) @name) @name.definition.type_alias

(class
  name: (_) @name) @name.definition.class

(instance
  name: (_) @name) @name.definition.instance

; Module header and imports
(header) @name.definition.module
(import) @name.definition.import
`
