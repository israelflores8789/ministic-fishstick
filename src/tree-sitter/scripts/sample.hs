module Demo (greet, Point(..), Color(..)) where

import Data.List (sort)
import qualified Data.Map as Map

data Point = Point { x :: Int, y :: Int }

newtype Wrapper a = Wrapper a

data Color = Red | Green | Blue

type Name = String

class Greet a where
  greet :: a -> String

instance Greet Int where
  greet n = "Hi, " ++ show n

greetPoint :: Point -> String
greetPoint p = "Point at " ++ show (x p) ++ "," ++ show (y p)

main :: IO ()
main = putStrLn (greet (5 :: Int))
