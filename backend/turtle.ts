import R from 'https://esm.sh/ramda'
import {JsonDB} from 'https://esm.sh/node-json-db'
import {Grid,AStarFinder} from 'https://esm.sh/pathfinding'
import { gzip, gunzip } from "https://deno.land/x/denoflate/mod.ts";
import { Pattern } from "./pattern.ts";

export interface Slot {
	count: number;
	name: string;
	damage: number;
}

export class Turtle{
	eval_: <T>(x: string) => Promise<T>;
	eval<T>(x: string): Promise<T>{
		if(this.enabled || this.iql)return this.eval_(x);
		return this.inspectQueue().then(_ => Promise.reject("disabled"));
	}
	db: JsonDB;
	id: string;
	diff: [number,number] = [0,1];
	pos: [number,number,number] = [0,0,0];
	fright(){
		let nd: [number,number] = [0,0];
		if(this.diff[0] == 0){
			if(this.diff[1] == 1){nd[0] = -1} else{nd[0] = 1};

		}else {
			nd[1] = this.diff[0];
		};
		this.diff = nd;
	}
	fleft(){
		this.fright();
		this.fright();
		this.fright();
	}
	get inventory(){
		return this.db.getData(`/${this.id}/inv`) as (Slot | null)[];
	}
	fuel(x?: number): number{
		let v = x ?? this.db.getData(`/${this.id}/f`);
		this.db.push(`/${this.id}/f`,v);
		return v;
	}
	grid<T>(fn: (x: Grid) => T,y?: number): T{
		let g = this.db.getData(`/${this.id}/${y ?? this.pos[1]}/grid`);
		let h: Grid;
		let w: any = g && Array.from(gunzip(new Uint8Array(g)));
		let perChunk = 131072;
		let ww: any = w && w.reduce((all: any,one: any ,i: any) => {
			const ch = Math.floor(i/perChunk); 
			all[ch] = [].concat((all[ch]||[]),one); 
			return all
		 }, []);
		if(g)h = new Grid(ww);
		if(!h)h = new Grid(131072,131072);
		let v = fn(h);
		this.db.push(`/${this.id}/${y ?? this.pos[1]}/grid`,Array.from(gzip(new Uint8Array(h.nodes.join([])),undefined)));
		return v;
	}
	getGrid(): Grid{
		return this.grid(g => g);
	}
	withDataID(otherTurtle: number,extra: () => string){
		return "/" + [this.id,otherTurtle].sort().join("/") + extra();
	}
	get allTurtles(){
		return Object.keys(this.db.getData("/")).map(parseFloat);
	}
	get enabled(){
		return (this.db.getData(`/${this.id}/e`) ?? true) as boolean;
	}
	set enabled(value: boolean){
		this.db.push(`/${this.id}/e`,value);
	}
	getQueue(other: number,name: string): any{
		let v = this.db.getData(this.withDataID(other,() => `/q/${name}`)) ?? [];
		let vv = v.length && v.pop();
		this.db.push(this.withDataID(other,() => `/q/${name}`),v);
		return Promise.resolve(vv);
	}
	getQueueAsync(other: number,name: string): Promise<any>{
		let v = this.db.getData(this.withDataID(other,() => `/q/${name}`)) ?? [];
		if(!v.length)return new Promise(c => setTimeout(c,1)).then(_ => this.getQueueAsync(other,name));
		let vv = v.length && v.pop();
		this.db.push(this.withDataID(other,() => `/q/${name}`),v);
		return vv;
	}
	pushQueue(other: number,name: string,val: any){
		let v = this.db.getData(this.withDataID(other,() => `/q/${name}`)) ?? [];
		v.push(val);
		this.db.push(this.withDataID(other,() => `/q/${name}`),v);
	}
	constructor(e: <T>(x: string) => Promise<T>,p: string){this.eval_ = e;this.db = new JsonDB(p);this.id = Math.random().toString();}
	iql = false;
	async processQueue(t: number,v: any){
		let {type,data} = v as {type: string,data: any};
		if(type === "forward")await this.forward();
		if(type === "left")await this.left();
		if(type === "right")await this.right();
		if(type === "dig")await this.dig(data[0],data[1]);
		if(type === "place")await this.place(data[0],data[1]);
		if(type === "drop")await this.drop(data[0],data[1]);
		if(type === "suck")await this.suck(data[0],data[1]);
		if(type === "sendTo")this.pushQueue(data[0],"message",data[1]);

	}
	async inspectQueue(){
		if(this.iql)return;
		this.iql = true;
		try{
			for(let t of this.allTurtles){let v: any = this.getQueue(t,"message");await this.processQueue(t,v);while(v){
				v = this.getQueue(t,"message");
				await this.processQueue(t,v);
			}};
		}finally{
			this.iql = false;
		}
	}
	async inspectAll(){
		if(this.iql || this.enabled){
		let v = await this.eval<{fw: any,u: any,d: any}>("{d=turtle.inspectDown(), u=turtle.inspectUp(), fw=turtle.inspect()}");
		this.db.push(`/${this.id}/${this.pos[1]}/${this.pos[0] + this.diff[0]},${this.pos[2] + this.diff[1]}`,v.fw);
		this.grid(g => g.setWalkableAt(this.pos[0] + this.diff[0],this.pos[2] + this.diff[1],v.fw[1] !== null));
		this.db.push(`/${this.id}/${this.pos[1] + 1}/${this.pos[0]},${this.pos[2]}`,v.u);
		this.grid(g => g.setWalkableAt(this.pos[0],this.pos[2],v.u[1] !== null),this.pos[1] + 1);
		this.db.push(`/${this.id}/${this.pos[1] - 1}/${this.pos[0]},${this.pos[2]}`,v.d);
		this.grid(g => g.setWalkableAt(this.pos[0],this.pos[2],v.d[1] !== null),this.pos[1] - 1);

		let inventory = await this.eval<(Slot | null)[]>('{' + new Array(16).fill(0).map((_, i) => `turtle.getItemDetail(${i + 1})`).join(', ') + '}');
		while (inventory.length < 16) {
			inventory.push(null);
		}
		this.db.push(`/${this.id}/inv`,inventory);
		this.fuel(await this.eval<number>("turtle.getFuelLevel()"));
		this.db.push(`/${this.id}/selectedSlot`,this.eval<number>("turtle.getSelectedSlot()"));
	};
		await this.inspectQueue();
	}
	get selectedSlot(){
		return this.db.getData(`/${this.id}/selectedSlot`) as number;
	}
	async selectSlot(slot: number) {
			let r = await this.eval<boolean>(`turtle.select(${slot})`);
			await this.inspectAll();
			return r;
	}
	async moveItems(slot: number, amount: 'all' | 'half' | 'one' | number) {
		let max = (this.db.getData(`/${this.id}/inv`) as (Slot | null)[])[this.selectedSlot - 1]?.count;
		if (max) {
			let count = amount === "one" ? 1 : amount;
			if (amount === 'all') count = max;
			else if (amount === 'half') count = Math.floor(max / 2);
			let r = await this.eval<boolean>(`turtle.transferTo(${slot}, ${count})`);
			await this.inspectAll();
			return r;
		}
		return false;
	}
	async craft(amount: 'all' | 'one' | number) {
		let r = await this.eval<boolean>(`turtle.craft(${amount === 'one' ? '1' : typeof amount === "string" ? '' : amount})`);
		await this.inspectAll();
		return r;
	}
	async getItemIndex(name: string): Promise<number | null> {
		let v = await this.eval<number>(`getItemIndex("${name}")`);
		return v;
	}
	resolvePattern(p: Pattern): Pattern{
		let pp: Pattern = new Map();
		for(let k of p.keys())pp.set([this.pos[0] + k[0],this.pos[1] + k[1],this.pos[2] + k[2]] as [number,number,number],p.get(k)!!);
		return pp;
	}
	async dropAll(x: string){
		for(let i of Array(16).map((x,i) => i)){
			await this.selectSlot(i + 1);
			await this.drop(x);
		}
	}
	async suckAll(x: string){
		for(let i of Array(16).map((x,i) => i)){
			await this.selectSlot(i + 1);
			await this.suck(x);
		}
	}
	get chests(){
		let v = this.db.getData(`/${this.id}/${this.pos[1]}`);
		let cs = [];
		for(let k in v)if(v[k].name === "minecraft:chest")cs.push([parseInt(k.split(',')[0]),this.pos[1],parseInt(k.split(',')[1])] as [number,number,number]);
		return cs;
	}
	get homeY(){
		return parseInt(this.db.getData(`/${this.id}/homeY`) ?? "255");
	}
	set homeY(value: number){
		this.db.push(`/${this.id}/homeY`,value.toString());
	}
	get homeRange(){
		return (this.db.getData(`/${this.id}/${this.homeY}/homeRange`) ?? "0,0,0,0").split(',').map(parseInt) as [number,number,number,number];
	}
	set homeRange(r: [number,number,number,number]){
		this.db.push(`/${this.id}/${this.homeY}/homeRange`,r.map(x => x.toString()).join(','));
	}
	get isInHomeRange(): (xyz: [number,number,number]) => boolean{
		return (xyz) => {
		let r = this.homeRange;
		let y = this.homeY;
		if(xyz[1] != y)return false;
		if(xyz[0] > r[1])return false;
		if(xyz[0] < r[0])return false;
		if(xyz[1] > r[3])return false;
		if(xyz[1] < r[2])return false;
		return true;
		};
	}
	get homeChest(){
		return this.chests.filter(this.isInHomeRange)[0];
	}
	async putPattern(p: Pattern){
		for(let k of p.keys()){
			await this.find3d([k[0] - 1,k[1],k[2]],false);
			while(this.diff[0] != 1 || this.diff[1] != 0)await this.left();
			let v = p.get(k)!!;
			if(v.value !== null){
				let i = await this.getItemIndex(v.value.name);
				let s = this.selectedSlot;
				if(i !== null)await this.selectSlot(i);
				if(i !== null)await this.moveItems(s,1);
				await this.selectSlot(s);
				await this.place('Forward');
			}else{
				await this.dig('Forward');
			}
		}
	}
	async craftRecipe(rec: [number, string | null][][], target: number): Promise<boolean> {
		let r = rec.reduce((x, y) => x.concat(y));
		let p = 0;
		for (var x in r) {

			if (r[x][1] !== null) {
				let i = await this.getItemIndex(r[x][1]!!);
				if(i === null){await this.suck('Forward', p.toString());return false;};
				await this.selectSlot(i!!); await this.moveItems(i!!, r[x][0]!!)
			};
			if (r[x][1] === null) {
				let c = this.inventory[x]?.count!!;
				p += c;
				await this.drop('Forward', c.toString());
			}
		};
		await this.selectSlot(target);
		await this.craft(1);
		await this.suck('Forward', p.toString());
		return true;
	}
	async applyDiff(diff: [number,number]): Promise<boolean>{
		while(this.diff[0] != diff[0] || this.diff[1] != diff[1])if(!await this.left())return false;
		return await this.forward();
	}
	async find(target: [number, number], dig?: boolean): Promise<void> {
		while (this.pos[0] != target[0] || this.pos[2] != target[1]) {
			let f = new AStarFinder();
			let path = this.grid(g => f.findPath(this.pos[0], this.pos[2], target[0], target[1], g.clone()));
			let diffs = path.map((x: any, i: any) => i === 0 ? null : [x[0] - path[i - 1][0], x[1] - path[i - 1][0]]).filter((x: any) => x);
			for (let d of diffs) if (!await this.applyDiff(d as [number, number])) break;

			if (dig) {
				let r = Math.round(Math.random() * 4);
				for (let _ in new Array(r)) await this.right();
				await this.dig('Forward');
				for (let _ in new Array(r)) await this.left();
			}
		}
	}
	async goToY(y: number, dig?: boolean) {
		while (this.pos[1] > y) { await this.down(); if (dig) await this.dig('Down') };
		while (this.pos[1] < y) { await this.up(); if (dig) await this.dig('Up') };
	}
	async dig(name: string,x?: string): Promise<boolean>{
		let v = await this.eval<boolean>(`turtle.dig${name.replace('Forward','')}("${x ?? ""}")`);
		if(!v)return v;
		await this.inspectAll();
		return v;
	}
	async find3d(target: [number, number, number], dig?: boolean) {
		await this.goToY(target[1], dig);
		await this.find([target[0], target[2]], dig);
	}
	async place(name: string,x?: string): Promise<boolean>{
		let v = await this.eval<boolean>(`turtle.place${name.replace('Forward','')}("${x ?? ""}")`);
		if(!v)return v;
		await this.inspectAll();
		return v;
	}
	async drop(name: string,x?: string): Promise<boolean>{
		let v = await this.eval<boolean>(`turtle.drop${name.replace('Forward','')}("${x ?? ""}")`);
		if(!v)return v;
		await this.inspectAll();
		return v;
	}
	async suck(name: string,x?: string): Promise<boolean>{
		let v = await this.eval<boolean>(`turtle.suck${name.replace('Forward','')}("${x ?? ""}")`);
		if(!v)return v;
		await this.inspectAll();
		return v;
	}
	async forward(): Promise<boolean>{
		let v = await this.eval<boolean>("turtle.forward()");
		if(!v)return v;
		this.pos[0] += this.diff[0];
		this.pos[2] += this.diff[1];
		await this.inspectAll();
		return v;
	}
	async left(): Promise<boolean>{
		let v = await this.eval<boolean>("turtle.turnLeft()");
		if(!v)return v;
		this.fleft();
		await this.inspectAll();
		return v;
	}
	async right(): Promise<boolean>{
		let v = await this.eval<boolean>("turtle.turnRight()");
		if(!v)return v;
		this.fright();
		await this.inspectAll();
		return v;
	}
	async down(): Promise<boolean>{
		let v = await this.eval<boolean>("turtle.down()");
		if(!v)return v;
		this.pos[1]--;
		await this.inspectAll();
		return v;
	}
	async up(): Promise<boolean>{
		let v = await this.eval<boolean>("turtle.up()");
		if(!v)return v;
		this.pos[1]++;
		await this.inspectAll();
		return v;
	}
}