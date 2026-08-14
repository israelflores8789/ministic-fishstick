import Mathlib.Data.Nat.Basic

open Nat

namespace Demo

theorem add_comm' (a b : Nat) : a + b = b + a := by
  induction a with
  | zero => simp
  | succ n ih => simp [Nat.succ_add, ih]

lemma double_nonneg (n : Nat) : 0 <= n + n := by
  omega

def double (n : Nat) : Nat := n + n

abbrev MyNat := Nat

structure Point where
  x : Nat
  y : Nat

inductive Color where
  | red | green | blue

class Greet (α : Type) where
  greet : α → String

instance : Greet Nat where
  greet n := s!"Hi, {n}"

end Demo
