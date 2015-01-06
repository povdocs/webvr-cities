window.dataViz('population', {
	layers: {
		population: true
	},
	info: [
		'<h2>Local population by race</h2>',
		'<p>Source: US Census 2010. Inspired by ',
		'<a href="http://www.coopercenter.org/demographics/Racial-Dot-Map" target="_new">',
		'The Racial Dot Map</a>.',
		'<ul style="list-style: none; padding: 0; margin: 0;">',
		'<li><span style="color: rgb(115, 178, 255);">&#x2B24;</span> White</li>',
		'<li><span style="color: rgb(85, 255, 0);">&#x2B24;</span> Black</li>',
		'<li><span style="color: rgb(255, 0, 0);">&#x2B24;</span> Asian</li>',
		'<li><span style="color: rgb(255, 170, 0);">&#x2B24;</span> Hispanic</li>',
		'<li><span style="color: rgb(136, 90, 68);">&#x2B24;</span> Other Race / Native American / Multi-racial</li>',
		'</ul>'
	].join(''),
	height: 30
});