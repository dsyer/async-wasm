A simple example of a Kubenetes controller in JavaScript. Code mostly copied from [Tech Squad](https://techsquad.rocks/blog/custom_kubernetes_operator_with_typescript/) with business logic from my [Cartograppher Demo](https://github.com/dsyer/carto-demo).

Set up the CRD:

```
$ kubectl apply -f image.yaml
```

Run the controller:

```
$ node main.js
5/26/2022, 11:07:47 AM: Watching API
```

Add an image resource and delete it:

```
$ kubectl apply -f demo.yaml
```

and:

```
5/26/2022, 11:07:47 AM: Received event in phase ADDED.
5/26/2022, 11:07:48 AM: Reconciling demo
```

Modify the resource and apply it again, then delete it and watch the controller logs:

```
5/26/2022, 11:11:20 AM: Received event in phase MODIFIED.
5/26/2022, 11:11:21 AM: Reconciling demo
5/26/2022, 11:17:53 AM: Received event in phase DELETED.
5/26/2022, 11:17:53 AM: Deleted demo
```