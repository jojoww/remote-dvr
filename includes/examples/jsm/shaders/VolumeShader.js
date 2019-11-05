/*
 * This shader is adapted from the official THREE.js example for direct volume
 * rendering 
 * (https://github.com/mrdoob/three.js/blob/dev/examples/jsm/shaders/VolumeShader.js)
 * Compared to the original one, the adapted version works on four channels
 * in parallel (in order to render up to four different volumes). We omitted
 * various refinement steps, hence the output is derived directly from the
 * original raycasting step. This saves calculation time and avoids problems
 * with the refinement steps that could occur when we have to do them for all
 * four channels separately.
 *
 * Accordingly, some uniforms are replicated for each channel. This could have
 * been done -- partially -- by using vec4 types, but we instead decided to use
 * a consistent naming scheme, since some uniforms are alreay non-scalar. 
 * Uniforms valid only for specific channels end with _0, _1, _2, _3 
 * 
 * Original info text:
 * @author Almar Klein / http://almarklein.org (Author of the original shader)
 *
 * Shaders to render 3D volumes using raycasting.
 * The applied techniques are based on similar implementations in the Visvis and Vispy projects.
 * This is not the only approach, therefore it's marked 1.
 */

import {
	Vector2,
	Vector3
} from "../../../build/three.module.js";

var VolumeRenderShader1 = {
	uniforms: {
		"u_slice": { value: 0. },
		"u_size": { value: new Vector3( 1, 1, 1 ) },
		"u_numSlices": { value: new Vector3( 1, 1, 1 ) },
		"u_renderstyle": { value: 0 },
		"u_data": { value: null },
		"u_samplingRate": { value: 1. },
		"u_grid2D": { value: new Vector2( 1, 1 ) },

		"u_renderthreshold_0": { value: 1. },
		"u_renderthreshold_1": { value: 1. },
		"u_renderthreshold_2": { value: 1. },
		"u_renderthreshold_3": { value: 1. },

		"u_clim_0": { value: new Vector2( 0, 1 ) },
		"u_clim_1": { value: new Vector2( 0, 1 ) },
		"u_clim_2": { value: new Vector2( 0, 1 ) },
		"u_clim_3": { value: new Vector2( 0, 1 ) },

		"u_gamma_0": { value: 1. },
		"u_gamma_1": { value: 1. },
		"u_gamma_2": { value: 1. },
		"u_gamma_3": { value: 1. },

		"u_colormode_0": { value: 1 },
		"u_colormode_1": { value: 1 },
		"u_colormode_2": { value: 1 },
		"u_colormode_3": { value: 1 },

		"u_used_0": { value: 0 },
		"u_used_1": { value: 0 },
		"u_used_2": { value: 0 },
		"u_used_3": { value: 0 },

		"u_customcolor_0": { value: new Vector3( 1, 1, 1 ) },
		"u_customcolor_1": { value: new Vector3( 1, 1, 1 ) },
		"u_customcolor_2": { value: new Vector3( 1, 1, 1 ) },
		"u_customcolor_3": { value: new Vector3( 1, 1, 1 ) },
		
		"u_cmdata_0": { value: null },
		"u_cmdata_1": { value: null },
		"u_cmdata_2": { value: null },
		"u_cmdata_3": { value: null }
	},
	vertexShader: [
		"		varying vec4 v_nearpos;",
		"		varying vec4 v_farpos;",
		"		varying vec3 v_position;",

		"		mat4 inversemat(mat4 m) {",
		// Taken from https://github.com/stackgl/glsl-inverse/blob/master/index.glsl
		// This function is licenced by the MIT license to Mikola Lysenko
		"				float",
		"				a00 = m[0][0], a01 = m[0][1], a02 = m[0][2], a03 = m[0][3],",
		"				a10 = m[1][0], a11 = m[1][1], a12 = m[1][2], a13 = m[1][3],",
		"				a20 = m[2][0], a21 = m[2][1], a22 = m[2][2], a23 = m[2][3],",
		"				a30 = m[3][0], a31 = m[3][1], a32 = m[3][2], a33 = m[3][3],",

		"				b00 = a00 * a11 - a01 * a10,",
		"				b01 = a00 * a12 - a02 * a10,",
		"				b02 = a00 * a13 - a03 * a10,",
		"				b03 = a01 * a12 - a02 * a11,",
		"				b04 = a01 * a13 - a03 * a11,",
		"				b05 = a02 * a13 - a03 * a12,",
		"				b06 = a20 * a31 - a21 * a30,",
		"				b07 = a20 * a32 - a22 * a30,",
		"				b08 = a20 * a33 - a23 * a30,",
		"				b09 = a21 * a32 - a22 * a31,",
		"				b10 = a21 * a33 - a23 * a31,",
		"				b11 = a22 * a33 - a23 * a32,",

		"				det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;",

		"		return mat4(",
		"				a11 * b11 - a12 * b10 + a13 * b09,",
		"				a02 * b10 - a01 * b11 - a03 * b09,",
		"				a31 * b05 - a32 * b04 + a33 * b03,",
		"				a22 * b04 - a21 * b05 - a23 * b03,",
		"				a12 * b08 - a10 * b11 - a13 * b07,",
		"				a00 * b11 - a02 * b08 + a03 * b07,",
		"				a32 * b02 - a30 * b05 - a33 * b01,",
		"				a20 * b05 - a22 * b02 + a23 * b01,",
		"				a10 * b10 - a11 * b08 + a13 * b06,",
		"				a01 * b08 - a00 * b10 - a03 * b06,",
		"				a30 * b04 - a31 * b02 + a33 * b00,",
		"				a21 * b02 - a20 * b04 - a23 * b00,",
		"				a11 * b07 - a10 * b09 - a12 * b06,",
		"				a00 * b09 - a01 * b07 + a02 * b06,",
		"				a31 * b01 - a30 * b03 - a32 * b00,",
		"				a20 * b03 - a21 * b01 + a22 * b00) / det;",
		"		}",


		"		void main() {",
		// Prepare transforms to map to "camera view". See also:
		// https://threejs.org/docs/#api/renderers/webgl/WebGLProgram
		"				mat4 viewtransformf = modelViewMatrix;",
		"				mat4 viewtransformi = inversemat(modelViewMatrix);",

		// Project local vertex coordinate to camera position. Then do a step
		// backward (in cam coords) to the near clipping plane, and project back. Do
		// the same for the far clipping plane. This gives us all the information we
		// need to calculate the ray and truncate it to the viewing cone.
		"				vec4 position4 = vec4(position, 1.0);",
		"				vec4 pos_in_cam = viewtransformf * position4;",

		// Intersection of ray and near clipping plane (z = -1 in clip coords)
		"				pos_in_cam.z = -pos_in_cam.w;",
		"				v_nearpos = viewtransformi * pos_in_cam;",

		// Intersection of ray and far clipping plane (z = +1 in clip coords)
		"				pos_in_cam.z = pos_in_cam.w;",
		"				v_farpos = viewtransformi * pos_in_cam;",

		// Set varyings and output pos
		"				v_position = position;",
		"				mat4 view = viewMatrix;",
		"				gl_Position = projectionMatrix * view * modelMatrix * position4;",
		"		}",
	].join( "\n" ),
	fragmentShader: [
		"		precision mediump float;",
		"		precision mediump int;",
		"		precision mediump /***samplerDeclaration***/;",

		"		uniform vec3 u_size;",
		"		uniform vec3 u_numSlices;",
		"		uniform int u_renderstyle;",
		"		uniform float u_slice;",
		"		uniform float u_samplingRate;",
		"		uniform float u_renderthreshold_0;",
		"		uniform float u_renderthreshold_1;",
		"		uniform float u_renderthreshold_2;",
		"		uniform float u_renderthreshold_3;",

		"		uniform float u_gamma_0;",
		"		uniform float u_gamma_1;",
		"		uniform float u_gamma_2;",
		"		uniform float u_gamma_3;",
		"		uniform int u_colormode_0;",
		"		uniform int u_colormode_1;",
		"		uniform int u_colormode_2;",
		"		uniform int u_colormode_3;",
		"		uniform int u_used_0;",
		"		uniform int u_used_1;",
		"		uniform int u_used_2;",
		"		uniform int u_used_3;",
		"		uniform vec3 u_customcolor_0;",
		"		uniform vec3 u_customcolor_1;",
		"		uniform vec3 u_customcolor_2;",
		"		uniform vec3 u_customcolor_3;",
		"		uniform vec2 u_clim_0;",
		"		uniform vec2 u_clim_1;",
		"		uniform vec2 u_clim_2;",
		"		uniform vec2 u_clim_3;",
		"		uniform sampler2D u_cmdata_0;",
		"		uniform sampler2D u_cmdata_1;",
		"		uniform sampler2D u_cmdata_2;",
		"		uniform sampler2D u_cmdata_3;",

		"		uniform /***samplerDeclaration***/ u_data;",
		"		uniform vec2 u_grid2D;",

		"		varying vec3 v_position;",
		"		varying vec4 v_nearpos;",
		"		varying vec4 v_farpos;",

		// The maximum distance through our rendering volume is sqrt(3).
		"		const int MAX_STEPS = 1774;	// 887 for 512^3, 1774 for 1024^3",
		"		const int REFINEMENT_STEPS = 4;",
		"		const float relative_step_size = 1.0;",
		"		const float shininess = 40.0;",

		"		void cast_mip(vec3 start_loc, vec3 step, int nsteps, vec3 view_ray);",
		"		void cast_average(vec3 start_loc, vec3 step, int nsteps, vec3 view_ray);",
		"		void cast_iso(vec3 start_loc, vec3 step, int nsteps, vec3 view_ray);",
		"		void cast_planes(vec3 start_loc);",

		"		vec4 sampleTexture(vec3 texcoords);",
		"		vec4 apply_colormap(vec4 val);",
		"		vec4 desaturate(vec4 color);",
		
		// Four times the same function but just caring about different components of the value 
		// vector. We do this because WebGL does only allow static vector access (but not 
		// something like vec[i]). Since this shader is just a string so far, we can at least
		// auto-generate the actual functions and don't have to manually write four versions.
		"		vec4 add_lighting0(float val, vec4 valVec, vec3 loc, vec3 step, vec3 view_ray);",
		"		vec4 add_lighting1(float val, vec4 valVec, vec3 loc, vec3 step, vec3 view_ray);",
		"		vec4 add_lighting2(float val, vec4 valVec, vec3 loc, vec3 step, vec3 view_ray);",
		"		vec4 add_lighting3(float val, vec4 valVec, vec3 loc, vec3 step, vec3 view_ray);",



		"		void main() {",
		"				vec3 farpos = v_farpos.xyz / v_farpos.w;",
		"				vec3 nearpos = v_nearpos.xyz / v_nearpos.w;",
		"				vec3 view_ray = normalize(nearpos.xyz - farpos.xyz);",
		
		// Compute the (negative) distance to the front surface or near clipping plane.
		// v_position is the back face of the cuboid, so the initial distance calculated in the dot
		// product below is the distance from near clip plane to the back of the cuboid
		"				float distance = dot(nearpos - v_position, view_ray);",
		"				distance = max(distance, min((-0.5 - v_position.x) / view_ray.x,",
		"																		(u_size.x - 0.5 - v_position.x) / view_ray.x));",
		"				distance = max(distance, min((-0.5 - v_position.y) / view_ray.y,",
		"																		(u_size.y - 0.5 - v_position.y) / view_ray.y));",
		"				distance = max(distance, min((-0.5 - v_position.z) / view_ray.z,",
		"																		(u_size.z - 0.5 - v_position.z) / view_ray.z));",
		
		// Now we have the starting position on the front surface
		"				vec3 front = v_position + view_ray * distance;",
		
		// Decide how many steps to take
		"				int nsteps = int(u_samplingRate * -distance / relative_step_size + 0.5);",
		"				if ( nsteps < 1 )",
		"						discard;",
		
		// Get starting location and step vector in texture coordinates
		// Note: u_size contains the data dimension in "microns" (not texture space). For
		// example, a volume of 100x100x100 voxels with voxel dimensions of 2x1x1 would 
		// result in a "micron" space of 200x100x100. Thus, in that case, we would perform up
		// to 200 sampling steps along the x axis, although actually 100 should be enough.
		// This is kind of a waste, especially when any of the voxel dimensions are much
		// bigger than 1. However, it's easier to understand. As long as we normalize the
		// voxel dimension to make the smallest component equal 1, it should be okay.
		"				vec3 step = ((v_position - front) / u_size) / float(nsteps);",
		"				vec3 start_loc = front / u_size;",
		"				if (u_renderstyle == 0)",
		"						cast_mip(start_loc, step, nsteps, view_ray);",
		"				else if (u_renderstyle == 1)",
		"						cast_iso(start_loc, step, nsteps, view_ray);",
		"				else if (u_renderstyle == 2)",
		"						cast_planes(start_loc);",
		"				else if (u_renderstyle == 3)",
		"						cast_average(start_loc, step, nsteps, view_ray);",
		"				if (gl_FragColor.a < 0.05)",
		"						discard;",
		"		}",
		
		// Will be replaced automatically, depending on whether we have access to WebGL 1 or 2
		"		vec4 sampleTexture(vec3 texcoords) {",
		"/***samplerFunction***/",
		"		}",

		// Will be replaced automatically, since we have to have basically the same function 
		// just with different vector components (x, y, z, w). Just for convenience.
		"/***lightingFunctions***/",

		
		// This function reduces saturation of fully saturated channels a little bit, otherwise
		// shading could look pretty ugly (no highlights etc.)
		"		vec4 desaturate(vec4 color) {",
		"			float maxVal = max(color.r, max(color.g, color.b));",
		"			if(maxVal > 0.98) color *= (0.98 / maxVal);",
		"			return color;",
		"		}",

		// This function takes the vector with intensity values for each channel, adjusts contrast
		// for each of them, translates them to a color. Note, the performance impact of this 
		// function could probably be reduced further (didn't optimize anything yet), but the 
		// sampling seems to be the bottleneck anyway (> 80%).
		// Note: this function must be called before lighting is calculated/added.
		"		vec4 apply_colormap(vec4 val) {",
		//"               return vec4(val.xyz, 1.);", // Debug & performance measure
		"				float val_0 = clamp((val[0] - u_clim_0[0]) / (u_clim_0[1] - u_clim_0[0]), 0., 1.);",
		"				float val_1 = clamp((val[1] - u_clim_1[0]) / (u_clim_1[1] - u_clim_1[0]), 0., 1.);",
		"				float val_2 = clamp((val[2] - u_clim_2[0]) / (u_clim_2[1] - u_clim_2[0]), 0., 1.);",
		"				float val_3 = clamp((val[3] - u_clim_3[0]) / (u_clim_3[1] - u_clim_3[0]), 0., 1.);",
		
		"				vec4 outV = vec4(0, 0, 0, 1);",
		"				vec4 black = vec4(0, 0, 0, 1);",
		
		"				val_0 = pow(abs(val_0), 1. / u_gamma_0);",
		"				val_1 = pow(abs(val_1), 1. / u_gamma_1);",
		"				val_2 = pow(abs(val_2), 1. / u_gamma_2);",
		"				val_3 = pow(abs(val_3), 1. / u_gamma_3);",

		"				if(u_used_1 != 0) outV += desaturate((u_colormode_1 == 1) ? (val_1 * vec4(u_customcolor_1, 1.)) : texture2D(u_cmdata_1, vec2(val_1, 0.5)));",
		"				if(u_used_0 != 0) outV += desaturate((u_colormode_0 == 1) ? (val_0 * vec4(u_customcolor_0, 1.)) : texture2D(u_cmdata_0, vec2(val_0, 0.5)));",
		"				if(u_used_2 != 0) outV += desaturate((u_colormode_2 == 1) ? (val_2 * vec4(u_customcolor_2, 1.)) : texture2D(u_cmdata_2, vec2(val_2, 0.5)));",
		"				if(u_used_3 != 0) outV += desaturate((u_colormode_3 == 1) ? (val_3 * vec4(u_customcolor_3, 1.)) : texture2D(u_cmdata_3, vec2(val_3, 0.5)));",
		"				return clamp(outV, 0., 1.);",
		"		}",


		// MIP - walk through the volume and remember "the brightest" spot
		"		void cast_mip(vec3 start_loc, vec3 step, int nsteps, vec3 view_ray) {",

		"				vec4 max_val = vec4(-1, -1, -1, -1);",
		"				vec4 val;",
		"				vec3 loc = start_loc;",
		"				for (int iter = 0; iter < MAX_STEPS; iter++) {",
		"						if (iter >= nsteps)",
		"								break;",
		"						val = sampleTexture(loc);",
		"						max_val = max(max_val, val);",
		"						loc += step;",
		"				}",
		/*
		// Refine location, gives crispier images
		"				vec3 iloc = start_loc + step * (float(max_i) - 0.5);",
		"				vec3 istep = step / float(REFINEMENT_STEPS);",
		"				for (int i = 0; i < REFINEMENT_STEPS; i++) {",
		"						max_val = max(max_val, sampleTexture(iloc));",
		"						iloc += istep;",
		"				}",
		*/		
		"				gl_FragColor = apply_colormap(max_val);",
		"		}",

		// Creates an "x-ray" image by averaging all volume elements along a ray
		"		void cast_average(vec3 start_loc, vec3 step, int nsteps, vec3 view_ray) {",
		"				int counter = 0;",
		"				vec3 loc = start_loc;",
		" 				vec4 outColor = vec4(0.);",
		" 				vec4 val;",
		"				for (int iter=0; iter<MAX_STEPS; iter++) {",
		"						if (iter >= nsteps)",
		"								break;",
		"						val = sampleTexture(loc);",
		"						outColor += val;",
		"						loc += step;",
		"						counter++;",
		"				}",
		"				gl_FragColor = apply_colormap(outColor / float(counter));",
		"		}",

		// Idea: On each side of the cube, map the respective slice on the outer surface. Like 
		// cutting off n planes from a side, take a photo, put back the removed slices, print 
		// the photo on the outside of the cube
		"		void cast_planes(vec3 start_loc) {",
		"				vec3 start_loc_r = vec3(max(0., 1. - start_loc.x), max(0., 1. - start_loc.y), max(0., 1. - start_loc.z));",
		"               vec3 dir = vec3(0., 0., 0.);",
		"				vec3 checkVec = start_loc_r;",
		// Find out from which side we are entering the volume. First: the axis.
		"               if(checkVec.x < checkVec.y && checkVec.x < checkVec.z) {dir = vec3(1., 0., 0.);}", //debugColor.x = 0.5 + 0.5 * sign;}",
		"               if(checkVec.y < checkVec.x && checkVec.y < checkVec.z) {dir = vec3(0., 1., 0.);}", //debugColor.y = 0.5 + 0.5 * sign;}",
		"               if(checkVec.z < checkVec.y && checkVec.z < checkVec.x) {dir = vec3(0., 0., 1.);}", //debugColor.z = 0.5 + 0.5 * sign;}",
		// Now find out direction along the axis (forward or backward)
		"				float sign = -1.;",
		"               float minA = min(start_loc.x, min(start_loc.y, start_loc.z));",
		"               float minB = min(start_loc_r.x, min(start_loc_r.y, start_loc_r.z));",
		"               if(minA < minB) {",
		"						checkVec = start_loc;",
		"						sign *= -1.;",
		"               }",
		// Find out how deep to go, depending on this fragment's cutting plange
		"               float depth = u_numSlices[0] * dir[0] + u_numSlices[1] * dir[1] + u_numSlices[2] * dir[2];",
		"				dir *= sign;",
		"				vec4 val = sampleTexture(start_loc + u_slice / depth * dir);",
		"				gl_FragColor = apply_colormap(val);",
		"       }",


		"		void cast_iso(vec3 start_loc, vec3 step, int nsteps, vec3 view_ray) {",
		"				gl_FragColor = vec4(0.0);	// init transparent",
		"				vec4 color3 = vec4(0.0);	// final color",
		"               vec4 val;",
		"				vec3 dstep = 1.5 / u_size;	// step to sample derivative",
		"				vec3 loc = start_loc;",
		"				vec4 outColor = vec4(0.);",

		// Stopping criterion: stop when sum(found_{1,2,3,4}) == 0. Hence, set every used channel to 1 first.
		"				int found_0 = u_used_0;",
		"				int found_1 = u_used_1;",
		"				int found_2 = u_used_2;",
		"				int found_3 = u_used_3;",

		// Enter the raycasting loop. In WebGL 1 the loop index cannot be compared with
		// non-constant expression. So we use a hard-coded max, and an additional condition
		// inside the loop.
		// Actually, we could do two things: calculate iso surface for each separately (and
		// mix colors) or just stop whenever we have reached at least one surface.
		"				for (int iter=0; iter<MAX_STEPS; iter++) {",
		"						if (iter >= nsteps)",
		"								break;",
		// "						if (found_0 + found_1 + found_2 + found_3 == 0)",
		// "								break;",

		// Sample from the 3D texture
		"						val = sampleTexture(loc);",

		"						if (found_0 > 0 && val[0] > u_renderthreshold_0) {",
		"								outColor += add_lighting0(val[0], vec4(val[0],0,0,0), loc, dstep, view_ray);",
		"                               break;", // Remove this for channel-wise iso surface
		"								found_0 = 0;",
		"						}",

		"						if (found_1 > 0  && val[1] > u_renderthreshold_1) {",
		"								outColor += add_lighting1(val[1], vec4(0, val[0],0,0), loc, dstep, view_ray);",
		"                               break;", // Remove this for channel-wise iso surface
		"								found_1 = 0;",
		"						}",

		"						if (found_2 > 0  && val[2] > u_renderthreshold_2) {",
		"								outColor += add_lighting2(val[2], vec4(0,0,val[0],0), loc, dstep, view_ray);",
		"                               break;", // Remove this for channel-wise iso surface
		"								found_2 = 0;",
		"						}",

		"						if (found_3 > 0  && val[3] > u_renderthreshold_3) {",
		"								outColor += add_lighting3(val[3], vec4(0,0,0,val[0]), loc, dstep, view_ray);",
		"                               break;", // Remove this for channel-wise iso surface
		"								found_3 = 0;",
		"						}",
		"						loc += step;",
		"				}",
		"				gl_FragColor = min(vec4(1., 1., 1., 1.), outColor);",
		"		}",


		// Refinement step for iso surface, if anyone needs it...
		/*
		
		"								vec3 istep = step / float(REFINEMENT_STEPS);",
		"								for (int i=0; i<REFINEMENT_STEPS; i++) {",
		"										val = sampleTexture(iloc).r;",
		"										if (val > u_renderthreshold) {",
		"												gl_FragColor = add_lighting(val, 0, iloc, dstep, view_ray);",
		"												return;",
		"										}",
		"										iloc += istep;",
		"								}",
		*/
	
		""
	].join( "\n" ),

	fragmentSampler3D : [

		"				/* Sample float value from a 3D texture. Assumes intensity data. */",
		"				return texture(u_data, texcoords.xyz);"
	].join( "\n" ),

	fragmentSampler3DDeclaration : "sampler3D",
	fragmentSampler2DDeclaration : "sampler2D",

	lighting: [ 'vec4 add_lightingCOMPONENT(float val, vec4 valVec, vec3 loc, vec3 step, vec3 view_ray)',
		'{',
		'		vec3 V = normalize(view_ray);',
		// calculate normal vector from gradient
		'		vec3 N;',
		'		float val1, val2;',
		'		val1 = sampleTexture(loc + vec3(-step[0], 0.0, 0.0))[COMPONENT];',
		'		val2 = sampleTexture(loc + vec3(+step[0], 0.0, 0.0))[COMPONENT];',
		'		N[0] = val1 - val2;',
		'		val = max(max(val1, val2), val);',
		'		val1 = sampleTexture(loc + vec3(0.0, -step[1], 0.0))[COMPONENT];',
		'		val2 = sampleTexture(loc + vec3(0.0, +step[1], 0.0))[COMPONENT];',
		'		N[1] = val1 - val2;',
		'		val = max(max(val1, val2), val);',
		'		val1 = sampleTexture(loc + vec3(0.0, 0.0, -step[2]))[COMPONENT];',
		'		val2 = sampleTexture(loc + vec3(0.0, 0.0, +step[2]))[COMPONENT];',
		'		N[2] = val1 - val2;',
		'		val = max(max(val1, val2), val);',
		'		float gm = length(N); // gradient magnitude',
		'		N = normalize(N);',
		// Flip normal so it points towards viewer
		'		float Nselect = float(dot(N, V) > 0.0);',
		'		N = (2.0 * Nselect - 1.0) * N;  // ==  Nselect * N - (1.0-Nselect)*N;',
		'		vec3 L = normalize(view_ray);',
		'		float lightEnabled = float( length(L) > 0.0 );',
		'		L = normalize(L + (1.0 - lightEnabled));',
		// Calculate lighting properties
		'		float lambertTerm = clamp(dot(N, L), 0.0, 1.0);',
		'		vec3 H = normalize(L+V); // Halfway vector',
		'		float specularTerm = pow(max(dot(H, N), 0.0), shininess);',
		'		vec4 color = vec4(0.);',
		// Before applying the color map, set the value to something constant near the max. Reasons:
		// - if you chose a custom color, we will use (almost exactly) this color (no matter how the 
		//   current contrast/gamma settings are)
		// - if you chose a texture (colormap), the max value is often just "white", so by 0.9 instead
		//   of 1 we hopefully have at least a color that's "somehow representing" the colormap.
		// - if we would choose not a constant value, but the local value, we would basically see
		//   noise, since for a iso surface it actually should be a constant color anyway and all
		//   we see here are numerical deviations from this perfect intensity
		'		color[COMPONENT] = 0.9;', 
		'		color = apply_colormap(color);',
		'		color *= (lambertTerm + specularTerm);',
		'		return color;',
		'}',
		''
		].join( "\n" ),


	getSampler2D : function(numSlices) {
		return [
		'		int z = int(min(u_numSlices.z - 1., max(0., texcoords.z * u_numSlices.z)));',
		'		int offsetX = int(mod(float(z), u_grid2D.x));',
		'		int offsetY = int(z / int(u_grid2D.x));',
		'		vec2 newCoords = vec2(float(offsetX), float(offsetY)) + texcoords.xy;',
		// Scale to new tex coords in 0/1
		'		newCoords /= u_grid2D;',
		'		return texture2D(u_data, newCoords);',
		''].join( "\n" );
	},

	

	getFragmentShader : function(use3DSampler, numSlices = 1) {
		var shader = this.fragmentShader;
		if(use3DSampler) {
			shader = shader.replace("/***samplerFunction***/", this.fragmentSampler3D);
			shader = shader.replace("/***samplerDeclaration***/", this.fragmentSampler3DDeclaration); // twice, two occurences
			shader = shader.replace("/***samplerDeclaration***/", this.fragmentSampler3DDeclaration);
		}
		else {
			shader = shader.replace("/***samplerFunction***/", this.getSampler2D(numSlices));
			shader = shader.replace("/***samplerDeclaration***/", this.fragmentSampler2DDeclaration); // twice, two occurences
			shader = shader.replace("/***samplerDeclaration***/", this.fragmentSampler2DDeclaration);
		}

		var lightingFunctions = "";

		for(var i = 0; i < 4; i++) {
			lightingFunctions += this.lighting.replace(/COMPONENT/g, i) 
			// 
		}
		shader = shader.replace("/***lightingFunctions***/", lightingFunctions)
		return shader;
	}
};

export { VolumeRenderShader1 };
