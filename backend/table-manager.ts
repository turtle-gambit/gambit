import {JsonDB} from 'https://esm.sh/node-json-db'
import { Slot, Turtle } from "./turtle.ts";
export interface Recipe{
type: string;
items: Slot[];
pos?: [number,number,number];
}
export class TableManager{
	db: JsonDB;
	tid: string;
	activateCallbacks: Map<string,(t: Turtle,pos: [number,number,number]) => Promise<void>> = new Map();
	get inventory(){return this.db.getData(`/${this.tid}/inv`) as (Slot | null)[];}
	getBlock(x: number,y: number,z: number): string{
		return `/${this.tid}/${y}/${x},${z}`
	}
	getRecipe(x: number,y: number,z: number): Recipe[]{
		return this.db.getData(this.getBlock(x,y,z) + `/r`);
	}
	setRecipe(x: number,y: number,z: number,w: Recipe[]){
		this.db.push(this.getBlock(x,y,z) + `/r`,w);
	}
	constructor(db: JsonDB,tid: string){this.db=db;this.tid=tid;}
	getCallback(id: string): Promise<[Turtle,[number,number,number]]>{
		return new Promise(c => {
			let cc = this.activateCallbacks.get(id);
			this.activateCallbacks.set(id,(...a) => {
				c(a);
				if(cc)this.activateCallbacks.set(id,cc);
				if(!cc)this.activateCallbacks.delete(id);
				return Promise.resolve();
			});
		});
	}
	async activate(t: Turtle,pos: [number,number,number]){
		if(this.activateCallbacks.has(t.id)){
			let x = this.activateCallbacks.get(t.id)!!;
			this.activateCallbacks.delete(t.id);
			return await x(t,pos);
		};
		let i = this.inventory;
		this.setRecipe(...pos,[{type: "input",items: [this.inventory[1]!!],pos: this.inventory[2]!!.name.includes("stone") ? pos : undefined}]);
		while(this.inventory[0]?.name!=="minecraft:green_wool"){
			let r = this.getRecipe(...pos);
			let [a,b] = await this.getCallback(t.id);
			let rr = {type: this.inventory[0]!!.name.includes("stone") ? "input" : "output",items: [this.inventory[1]!!],pos: this.inventory[2]!!.name.includes("stone") ? b : undefined};
			this.setRecipe(...pos,[...r,rr]);
		}

	}
}