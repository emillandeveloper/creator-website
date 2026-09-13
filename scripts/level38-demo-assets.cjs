// Original geometric demo artwork for this project. No third-party game sprites.
// Run npm run build first, then node scripts/level38-demo-assets.cjs.
const fs = require("node:fs");
const path = require("node:path");
const { CLASS_CATALOG } = require("../dist/modules/level38/classes");
const root = path.resolve(__dirname, "../public/img/level38");
const palettes = ["#87bbd3", "#9387ca", "#739ccd", "#e5a174", "#89b57c", "#8892bc", "#ce796b", "#9eba7f", "#a58bdd", "#dfdfc8", "#d78885", "#7dbee1", "#b499d5", "#d9b768", "#ce99c9", "#b7a17b"];
const rect = (x,y,w,h,fill) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
for (const [index, job] of CLASS_CATALOG.entries()) {
  let drawing = "";
  for (let frame = 0; frame < 4; frame++) {
    const bob = frame === 1 || frame === 2 ? -1 : 0;
    const color = palettes[index % palettes.length];
    let person = rect(9,28,16,2,"#070e1b") + rect(12,23,4,5,"#253044") + rect(19,23,4,5,"#253044")
      + rect(10,13+bob,15,12,color) + rect(13,8+bob,9,7,"#e5bb98")
      + rect(12,5+bob,11,6,color) + rect(10,8+bob,15,3,color)
      + rect(18,10+bob,2,2,"#152238") + rect(11,19+bob,13,2,"#e1c178")
      + rect(8,15+bob,3,7,color) + rect(24,15+bob,3,7,color);
    if (index % 4 === 0) person += rect(4,14+bob,6,9,"#253c57") + rect(5,15+bob,4,5,"#c1d3d8") + rect(26,7+bob,2,15,"#d7dfce") + rect(24,19+bob,6,2,"#e3bf70");
    if (index % 4 === 1) person += rect(12,3+bob,3,4,color) + rect(21,2+bob,3,5,color) + rect(5,20+bob,7,2,"#e3bf70") + rect(4,8+bob,2,12,"#bbc8cf");
    if (index % 4 === 2) person += rect(16,1+bob,4,6,color) + rect(20,2+bob,5,2,"#dfbd73") + rect(5,7+bob,2,19,"#b89063") + rect(4,3+bob,4,5,"#c4d5d6");
    if (index % 4 === 3) person += rect(12,3+bob,9,3,color) + rect(14,1+bob,5,3,color) + rect(4,10+bob,2,17,"#b89063") + rect(3,6+bob,4,5,"#e3bf70");
    drawing += `<g transform="translate(${frame * 32} 0)">${person}</g>`;
  }
  const dest = path.join(root,"classes",job.id); fs.mkdirSync(dest,{recursive:true});
  fs.writeFileSync(path.join(dest,"idle.svg"), `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="32" viewBox="0 0 128 32" shape-rendering="crispEdges"><!-- Original LEVEL 38 demo sprite. Replace via the class catalog. -->${drawing}</svg>\n`);
}
let scene = rect(0,0,480,220,"#101e35") + rect(0,126,480,94,"#152b3b");
for(let i=0;i<46;i++) scene += rect((i*79+13)%476,(i*31+11)%105,i%5===0?2:1,i%5===0?2:1,i%3===0?"#cbbd86":"#5d7c91");
scene += `<path d="M354 14h22v4h8v8h4v22h-4v8h-8v4h-22v-4h-8v-8h-4V26h4v-8h8z" fill="#e1d9a8"/>`;
scene += rect(349,25,7,5,"#babf9f") + rect(363,46,12,5,"#babf9f");
scene += `<path d="M0 117h14v-12h18V91h14V75h18v16h12v12h16v16h12v-9h18V93h12V77h14V59h16v18h14v17h16v18h20V98h16V82h18v16h18v16h18v-10h14V88h18v-9h16v17h16v17h14v-7h14V87h16V69h20v17h14v19h20v14h24v-11h16v-8h18v18h18v102H0z" fill="#233c50"/>`;
scene += `<path d="M0 153h24v-8h26v-12h24v-10h18v12h26v11h28v-9h24v-18h24v-11h20v10h22v13h32v-8h22v-14h24v15h24v16h22v-7h20v-14h24v11h20v12h28v-9h20v-6h26v12h24v-12h18v14h20v8h16v80H0z" fill="#315548"/>`;
scene += `<path d="M0 182h32v-12h36v-12h36v7h44v-9h28v-14h26v-8h34v-7h38v10h34v18h38v8h26v-8h30v12h46v15h32v38H0z" fill="#172e32"/>`;
// A small hilltop keep: deliberately original silhouette, not a game landmark.
scene += rect(221,105,57,29,"#637f79") + rect(214,93,16,41,"#809790") + rect(268,88,16,46,"#809790")
  + rect(236,87,28,47,"#8ca096") + rect(242,77,16,12,"#9baa99");
for (const x of [214,224,268,278,236,246,256]) scene += rect(x,x<230?89:x>265?84:83,5,7,"#b5b99c");
scene += rect(246,114,8,20,"#223642") + rect(219,103,3,7,"#e7c476") + rect(274,98,3,7,"#e7c476") + rect(245,96,8,9,"#dfc278")
  + rect(249,57,2,22,"#9cac9a") + rect(251,57,18,9,"#d8b164") + rect(251,66,12,3,"#d8b164");
scene += `<path d="M246 134h8v7h-10v10h-14v10h-18v12h-22v10h-24v12h-24v12h-24v13H68v-10h27v-12h25v-12h23v-10h27v-13h24v-11h24v-10h28z" fill="#8f9270"/>`;
for (const [x,y,s] of [[6,149,2],[43,142,1],[102,144,1],[331,135,1],[405,142,2],[449,165,2]]) {
  scene += `<g transform="translate(${x} ${y}) scale(${s})"><path d="M8 0h4v5h4v5h4v5h4v5H0v-5h4v-5h4z" fill="#386449"/>${rect(10,18,3,10,"#41604a")}</g>`;
}
for(let i=0;i<43;i++) scene += rect((i*47+5)%480,191+(i*13)%27,3,2,i%3===0?"#9a995f":"#3d6050");
fs.writeFileSync(path.join(root,"world.svg"),`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="440" viewBox="0 0 480 220" shape-rendering="crispEdges"><!-- Original LEVEL 38 pixel landscape. -->${scene}</svg>\n`);
console.log("Created the original landscape and 16 demo sprite sheets.");
