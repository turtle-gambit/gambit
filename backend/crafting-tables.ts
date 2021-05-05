export type Crafting = [string,number,[number, string | null][][]];
export let planks = (base: string) => [base + "_planks",4,[[[1,base + "_log"],[0,null],[0,null]],[[0,null],[0,null],[0,null]],[[0,null],[0,null],[0,null]]]] as Crafting;
export let stick = (plank: string) => ["minecraft:stick",4,[[[1,plank],[0,null],[0,null]],[[1,plank],[0,null],[0,null]],[[0,null],[0,null],[0,null]]]] as Crafting;
//engineerstools:crushing_hammer
export let dust = (base: string,resolve: (x: string) => string) => [resolve(base),4,[[[1,base + "_ore"],[0,null],[0,null]],[[1,"engineerstools:crushing_hammer"],[0,null],[0,null]],[[0,null],[0,null],[0,null]]]] as Crafting;
export type Use = [string,number,string,[number,string|null][]];
export let furnace = (stone: string) => ["minecraft:furnace",1,[[[1,stone],[1,stone],[1,stone]],[[1,stone],[0,null],[1,stone]],[[1,stone],[1,stone],[1,stone]]]] as Crafting;
export let ingot = (base: string,resolveDust: (x: string) => string,resolveIngot: (x: string) => string) =>  [resolveIngot(base),1,"minecraft:furnace",[[1,resolveDust(base)]]] as Use;

