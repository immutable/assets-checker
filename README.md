# Assets Checker
A Github Action to Analyse your static image files on generating Pull Request and warns if the size increase the threshold size. It check for .jpg, .svg, .png, .gif, .jpeg, .webp, and .riv files. 

## Install
```npm i```
or
```yarn install```

## Build
```
npm run build
```


## Output Stats

### Success
![Screenshot 2024-05-23 at 4 28 37 PM](https://github.com/immutable/assets-checker/assets/1452237/5d586d4f-9e49-499b-8459-ebe22863b847)

### Failure
![Screenshot 2024-05-23 at 4 30 21 PM](https://github.com/immutable/assets-checker/assets/1452237/7e39fbe3-af4a-43ff-a16a-e5e0a84321f9)

### .assets-ignore file
Sometimes its not possible to optimise an image, or you may not need to because you're utilising Biome's inbuilt `aws-image-resizer` functionality. In cases like these, we can ignore these files by using a .assets-ignore file inside the root of the repository.

<img width="300" alt="Screenshot 2022-08-24 at 4 49 39 PM" src="https://user-images.githubusercontent.com/61680562/240576818-7326f846-7d78-43e1-8b21-db96b9cb27a0.png">

#### The ignore assets name must be add as full path and separate - separate lines:
<img width="400" alt="Screenshot 2022-08-24 at 4 49 39 PM" src="https://user-images.githubusercontent.com/61680562/240576944-fdba0c9f-f349-4a1b-b9d5-adf569d73601.png">

## Usage:

Check [Demo.yml](./demo.yml) for complete configuration(on using github actions)

## License

The scripts and documentation in this project are released under the [MIT License](./LICENSE)
