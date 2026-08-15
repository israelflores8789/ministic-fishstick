export default `
; Adapted directly from tree-sitter-scala's own queries/tags.scm, renamed
; to this project's @name.definition.* convention. Reference captures
; (call/interface/class references) omitted, matching how Lean and Haskell
; were handled — this MCP indexes definitions, not call sites.

(package_clause
  name: (package_identifier) @name) @name.definition.package

(trait_definition
  name: (identifier) @name) @name.definition.interface

(enum_definition
  name: (identifier) @name) @name.definition.enum

(simple_enum_case
  name: (identifier) @name) @name.definition.class

(full_enum_case
  name: (identifier) @name) @name.definition.class

(class_definition
  name: (identifier) @name) @name.definition.class

(object_definition
  name: (identifier) @name) @name.definition.object

(function_definition
  name: (identifier) @name) @name.definition.function

(val_definition
  pattern: (identifier) @name) @name.definition.variable

(given_definition
  name: (identifier) @name) @name.definition.variable

(var_definition
  pattern: (identifier) @name) @name.definition.variable

(val_declaration
  name: (identifier) @name) @name.definition.variable

(var_declaration
  name: (identifier) @name) @name.definition.variable

(type_definition
  name: (type_identifier) @name) @name.definition.type

(class_parameter
  name: (identifier) @name) @name.definition.property
`