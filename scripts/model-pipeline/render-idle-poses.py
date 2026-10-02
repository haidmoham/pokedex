import bpy, sys, math, os, json, struct
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:]
source,dest=args[0],args[1]
soft_light=len(args)>3 and args[3]=='soft-light'
detail='detail' in args[3:]
view='front' if 'front' in args[3:] else 'rear' if 'rear' in args[3:] else 'side' if 'side' in args[3:] else 'three-quarter'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.abspath(source))
scene=bpy.context.scene
duration=float(args[2]); scene.render.fps=24
scene.frame_set(1)
with open(source,'rb') as handle: raw=handle.read()
json_size=struct.unpack_from('<I',raw,12)[0]
source_meshes={mesh.get('name') for mesh in json.loads(raw[20:20+json_size]).get('meshes',[]) if mesh.get('name')}
meshes=[o for o in scene.objects if o.type=='MESH' and o.name in source_meshes]
if not meshes: raise ValueError('No source meshes after excluding importer helpers')
deps=bpy.context.evaluated_depsgraph_get()
coords=[]
for phase in ([0,.125,.375,.625,1] if detail else [1/(duration*24)]):
 frame=duration*24*phase
 scene.frame_set(int(frame),subframe=frame-int(frame))
 deps=bpy.context.evaluated_depsgraph_get()
 coords.extend(o.matrix_world@Vector(c) for o in meshes for c in o.evaluated_get(deps).bound_box)
lo=Vector([min(c[i] for c in coords) for i in range(3)]);hi=Vector([max(c[i] for c in coords) for i in range(3)])
center=(hi+lo)/2; size=max(hi-lo)
camera_direction=(0,-3,.5) if view=='front' else (0,3,.5) if view=='rear' else (3,0,.5) if view=='side' else (1.6,-3,.9)
bpy.ops.object.camera_add(location=center+Vector(camera_direction)*size)
camera=bpy.context.object;camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=size*(1.2 if detail else 1.5);scene.camera=camera
for pos,power in [((2,-3,4),1200),((-3,-1,2),900),((1,3,3),1300)]:
 bpy.ops.object.light_add(type='AREA',location=center+Vector(pos)*size)
 o=bpy.context.object;o.data.energy=power*size*size*(.25 if soft_light else 1);o.data.shape='DISK';o.data.size=size*3;o.rotation_euler=(center-o.location).to_track_quat('-Z','Y').to_euler()
scene.world=bpy.data.worlds.new('World');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.35,.38,.44,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.8
scene.render.engine='CYCLES';scene.cycles.samples=16;scene.cycles.use_denoising=False;scene.render.resolution_x=720 if detail else 360;scene.render.resolution_y=720 if detail else 420;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='Standard';scene.render.film_transparent=False
import hashlib, json, struct
results=[]
for index,phase in enumerate([0.125,0.375,0.625]):
 frame=duration*24*phase
 scene.frame_set(int(frame),subframe=frame-int(frame))
 deps=bpy.context.evaluated_depsgraph_get()
 points=[]
 for o in meshes:
  evaluated=o.evaluated_get(deps);mesh=evaluated.to_mesh()
  points.extend(tuple(evaluated.matrix_world@v.co) for v in mesh.vertices)
  evaluated.to_mesh_clear()
 digest=hashlib.sha256(b''.join(struct.pack('fff',*p) for p in points)).hexdigest()
 results.append({'phase':phase,'frame':frame,'worldVertexSha256':digest})
 scene.render.filepath=os.path.abspath(dest+f'-pose-{index+1}.png')
 bpy.ops.render.render(write_still=True)
with open(dest+'-poses.json','w') as f:json.dump(results,f,indent=2)
