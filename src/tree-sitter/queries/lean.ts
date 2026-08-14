// Lean4 Tree-Sitter Query Patterns
export default `
; Adapted from wvhulle/tree-sitter-lean's own queries/tags.scm, retargeted
; to match this project's @name.definition.* capture convention.

; Function-like declarations: def, theorem, lemma, abbrev, instance, example.
; "definition" matches whether or not it's wrapped in a "decorated_declaration"
; (private/noncomputable modifiers, @[attributes], or a doc comment), since
; tree-sitter queries match at any depth — no need to handle both separately.
(definition
  name: (identifier) @name) @name.definition.function

; Same declaration, but captured via its "decorated_declaration" wrapper when
; one exists — this widens the span to include any leading doc comment and
; @[attributes], so the embedded text carries the natural-language docstring
; content, not just the bare Lean syntax. Both this and the pattern above
; will fire for a decorated declaration (same @name, two different spans);
; the indexer should prefer this wider capture when both are present for the
; same declaration, and fall back to the plain "definition" span otherwise.
(decorated_declaration
  declaration: (definition
    name: (identifier) @name)) @name.definition.function.decorated

(example) @name.definition.function

; Constants and axioms
(constant
  name: (identifier) @name) @name.definition.constant

(axiom
  name: (identifier) @name) @name.definition.constant

; Type declarations
(structure
  name: (identifier) @name) @name.definition.type

(inductive
  name: (identifier) @name) @name.definition.type

(class_inductive
  name: (identifier) @name) @name.definition.type

; Constructors and structure fields
(constructor
  name: (identifier) @name) @name.definition.struct

(structure_field
  name: (identifier) @name) @name.definition.field

; Namespaces and sections
(namespace
  name: (identifier) @name) @name.definition.module

(section
  name: (identifier) @name) @name.definition.module

; Initialize / set_option / syntax declarations
(initialize
  name: (identifier) @name) @name.definition.constant

(set_option
  name: (identifier) @name) @name.definition.constant

(syntax
  attr: (identifier) @name) @name.definition.macro

; Import and open statements (not in the original tags.scm, added here for
; parity with the Go query's import_declaration / package_clause captures)
(import) @name.definition.import

(open) @name.definition.open
`
