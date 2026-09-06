export const noise = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.;float a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=mat2(.8,.6,-.6,.8)*p*2.03+13.1;a*=.5;}return v;}`;
export const starVertex = `
attribute vec3 center; attribute vec3 tint; attribute vec2 params;
varying vec2 vUv; varying vec3 vColor; varying vec2 vParams;
void main(){vUv=uv;vColor=tint;vParams=params;vec3 p=center+vec3(position.xy*params.x*6.,0.);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`;
export const starFragment = `
uniform float time; varying vec2 vUv; varying vec3 vColor; varying vec2 vParams;
${noise}
void main(){
vec2 p=(vUv-.5)*6.;float r=length(p);float angle=atan(p.y,p.x);float seed=vParams.y;
float owned=step(.5,seed);float t=time*.13;
float n=fbm(p*4.+vec2(t+seed,-t));float fine=noise(p*30.+seed+t*2.);
float disc=1.-smoothstep(.96,1.02,r);float sphere=sqrt(max(0.,1.-r*r));
vec3 body=mix(vColor*.4,vColor*1.1+vec3(.08),sphere)*(.48+n*.75+fine*.2);
float filaments=fbm(vec2(angle*5.+seed,r*6.-t*2.));
float corona=exp(-max(0.,r-1.)*5.)*(.10+filaments*.32)*(1.-disc);
float halo=exp(-r*r*1.1)*.08;
float rim=exp(-abs(r-1.)*45.)*.7;
float flare=exp(-abs(p.y)*48.)*exp(-abs(p.x)*1.4)*.12;
vec3 col=(body*disc+vColor*(corona+halo+rim+flare))*owned;
col+= (vec3(.007,.013,.02)*disc*(.6+n)+vColor*(rim*.23+halo*.10))*(1.-owned);
gl_FragColor=vec4(col,1.);
}`;
export const particleVertex = `
attribute vec3 tint;attribute float size;varying vec3 vColor;uniform float scale;uniform float time;
void main(){vColor=tint;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=clamp(size*scale,1.5,18.);}`;
export const particleFragment = `
varying vec3 vColor;
void main(){float r=length(gl_PointCoord-.5)*2.;float core=exp(-r*r*12.);float glow=exp(-r*r*3.)*.28;gl_FragColor=vec4(vColor*(core*1.7+glow),1.);}`;
export const backgroundFragment = `
uniform float time;varying vec2 vUv;
${noise}
void main(){vec2 p=vUv*7.;float t=time*.003;
float a=fbm(p+vec2(t,0.));float b=fbm(p*2.+a*2.5);float clouds=pow(max(0.,b),3.);
float band=exp(-pow((p.y-p.x*.42-1.9+sin(p.x*.6)*.6)*1.4,2.));
vec3 col=vec3(.0012,.0025,.006)+vec3(.007,.018,.035)*clouds*band*2.;
col+=vec3(.028,.009,.045)*pow(a,3.)*(1.-band)*.6;
col+=vec3(.009,.04,.06)*pow(fbm(p*3.+b*3.),4.)*band;
gl_FragColor=vec4(col,1.);}`;
